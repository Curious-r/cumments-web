import { css, html, LitElement } from "lit"
import { customElement, property, state } from "lit/decorators.js"
import { repeat } from "lit/directives/repeat.js"
import type { Message } from "../../api/contract/query"

type PollContent = {
  question: string
  options: Array<{ id: string; text: string }>
  max_selections: number
  responses: Array<{ option_index: number; count: number }>
}

@customElement("cumments-poll-view")
export class CummentsPollView extends LitElement {
  @property({ type: Object }) message!: Message
  @property({ type: Boolean }) voting = false
  @property({ type: String }) error: string | null = null
  @property({ attribute: false }) onVote?: (pollId: string, optionId: string) => Promise<void>

  @state() private selectedOptionId: string | null = null
  @state() private localError: string | null = null
  @state() private isSubmitting = false

  static styles = css`
    :host { display: block; }
    .poll { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin: 6px 0; }
    .question { font-weight: 600; margin-bottom: 8px; font-size: 14px; }
    .options { display: flex; flex-direction: column; gap: 6px; }
    .option { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; background: #f8fafc; }
    .option.selected { border-color: #4f46e5; background: #eef2ff; }
    .option-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .count { font-size: 12px; color: #64748b; }
    .bar { height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 6px; overflow: hidden; }
    .fill { height: 100%; background: #4f46e5; }
    .vote-btn { margin-top: 8px; font-size: 13px; background: #4f46e5; color: white; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; }
    .vote-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .error { font-size: 12px; color: #ef4444; margin-top: 6px; }
  `

  private get pollId(): string {
    return (this.message as unknown as Record<string, unknown>).event_id as string
  }

  private get pollContent(): PollContent {
    const c = this.message.content as unknown as PollContent
    return {
      question: c.question ?? "",
      options: c.options ?? [],
      max_selections: (c as unknown as { max_selections: number }).max_selections ?? 1,
      responses:
        (c as unknown as { responses: Array<{ option_index: number; count: number }> }).responses ??
        [],
    }
  }

  private get totalVotes(): number {
    const { responses } = this.pollContent
    return responses.reduce((s, r) => s + (r.count as number), 0)
  }

  private handleSelect = (e: Event) => {
    const target = e.target as HTMLInputElement
    this.selectedOptionId = target.value
    this.localError = null
    this.error = null
  }

  private handleVote = async () => {
    if (!this.selectedOptionId || this.voting || this.isSubmitting) return
    const pollId = this.pollId
    const optionId = this.selectedOptionId
    if (!pollId || !optionId) return
    this.isSubmitting = true
    this.localError = null
    try {
      if (this.onVote) {
        await this.onVote(pollId, optionId)
      } else {
        // fallback dispatch event
        this.dispatchEvent(
          new CustomEvent("poll-vote", {
            bubbles: true,
            composed: true,
            detail: { pollId, optionId },
          }),
        )
      }
      // on success, keep selection (showing voted state) and clear error
      this.localError = null
    } catch (err) {
      this.localError = err instanceof Error ? err.message : String(err)
    } finally {
      this.isSubmitting = false
    }
  }

  private handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && this.selectedOptionId && !this.voting && !this.isSubmitting) {
      e.preventDefault()
      void this.handleVote()
    }
  }

  render() {
    const { question, options, responses } = this.pollContent
    const total = this.totalVotes
    const isVoting = this.voting || this.isSubmitting
    const displayError = this.localError ?? this.error
    const canVote = !!this.selectedOptionId && !isVoting

    return html`<div class="poll" role="group" aria-label="Poll: ${question}" @keydown=${this.handleKeydown}>
      <div class="question" id="poll-question-${this.pollId}">${question}</div>
      <div class="options" role="radiogroup" aria-labelledby="poll-question-${this.pollId}" aria-describedby="poll-total-${this.pollId}">
        ${repeat(
          options,
          (opt) => opt.id,
          (opt, idx) => {
            const resp = responses.find((r) => r.option_index === idx)
            const count = resp?.count ?? 0
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            const isSelected = this.selectedOptionId === opt.id
            const optionId = `poll-${this.pollId}-opt-${opt.id}`
            return html`<div class="option ${isSelected ? "selected" : ""}">
              <div class="option-header">
                <label for="${optionId}" style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer">
                  <input
                    id="${optionId}"
                    type="radio"
                    name="poll-${this.pollId}"
                    .value=${opt.id}
                    .checked=${isSelected}
                    ?disabled=${isVoting}
                    @change=${this.handleSelect}
                    aria-label="${opt.text}"
                  />
                  <span style="font-size:14px">${opt.text}</span>
                </label>
                <span class="count" aria-label="${count} votes">${count} votes · ${pct}%</span>
              </div>
              <div class="bar" aria-hidden="true"><div class="fill" style="width:${pct}%"></div></div>
            </div>`
          },
        )}
      </div>
      <button
        class="vote-btn"
        aria-label="Vote for selected option"
        ?disabled=${!canVote}
        @click=${this.handleVote}
        aria-busy=${isVoting ? "true" : "false"}
      >${isVoting ? "Voting…" : "Vote"}</button>
      ${displayError ? html`<div class="error" role="alert" aria-live="assertive">${displayError}</div>` : ""}
      ${total > 0 ? html`<div id="poll-total-${this.pollId}" style="font-size:11px;color:#94a3b8;margin-top:6px">${total} total votes</div>` : html`<div id="poll-total-${this.pollId}" style="font-size:11px;color:#94a3b8;margin-top:6px">No votes yet</div>`}
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cumments-poll-view": CummentsPollView
  }
}
