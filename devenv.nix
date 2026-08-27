{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:
{
  env.GREET = "cumments-web";

  # https://devenv.sh/packages/
  packages = with pkgs; [
    nixfmt
    nixd
    yaml-language-server
    nodejs_24
    pnpm
  ];

  # https://devenv.sh/languages/
  languages = {
    nix.enable = true;
    javascript = {
      enable = true;
      npm.enable = true;
    };
    typescript.enable = true;
  };

  # https://devenv.sh/git-hooks/
  git-hooks.hooks = {
    # Will be extended when tooling lands:
    # - eslint / prettier / tsc checks
    # Keep minimal for now per Phase 0 requirement.
  };

  enterShell = ''
    echo "cumments-web devenv ready — node $(node --version), pnpm $(pnpm --version)"
  '';

  # https://devenv.sh/tasks/
  # tasks = {
  #   "cumments-web:setup".exec = "pnpm install";
  # };

  # https://devenv.sh/tests/
  enterTest = ''
    echo "Running tests"
  '';

  # See full reference at https://devenv.sh/reference/options/
}
