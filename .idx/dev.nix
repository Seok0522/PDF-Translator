{ pkgs, ... }: {
  channel = "stable-24.05";
  packages = [
    pkgs.nodejs_20
  ];
  idx = {
    extensions = [
      "esbenp.prettier-vscode"
      "dsznajder.es7-react-js-snippets"
    ];
    workspace = {
      onCreate = {
        npm-install = "npm install";
      };
      onStart = {
        start-dev = "npm run dev";
      };
    };
    previews = {
      enable = true;
      previews = {
        web = {
          command = ["npm" "run" "dev" "--" "--port" "$PORT" "--host" "0.0.0.0"];
          manager = "web";
        };
      };
    };
  };
}
