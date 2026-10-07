# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

*Politique de signature du code de mdbase. Elle est rédigée en anglais pour SignPath Foundation, qui signe gratuitement les binaires Windows des projets open source.*

## What is signed

The Windows desktop application of mdbase (installer and executable), built from the source code of this repository by GitHub Actions. No binary built on a personal machine is ever signed. Each signed release is built from a tagged commit of the `main` branch and published on the [GitHub Releases](https://github.com/alexisraitano-myffu/mdbase/releases) page.

The project is released under the [MIT License](LICENSE) and contains no proprietary code. Third-party libraries are open source and listed in `package.json` (and, for the desktop application, in its Rust manifest).

## Team roles

- **Committers and reviewers:** [alexisraitano-myffu](https://github.com/alexisraitano-myffu) (maintainer). External contributions are merged only through a pull request reviewed by the maintainer.
- **Approvers:** [alexisraitano-myffu](https://github.com/alexisraitano-myffu) (maintainer). Every signing request is approved manually.

All team members use multi-factor authentication on GitHub and on SignPath.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

In detail:

- mdbase stores everything in a folder chosen by the user, on their own disk. It has no account, no server and no telemetry.
- The AI assistant is disabled by default. Once the user enables it and enters the address of an AI service and their own key, the content needed to answer each request is sent to that service only, and is subject to that service's privacy policy.
- The Jira integration, when the user sets it up, only reads from the Jira site the user configured, with the user's own credentials, kept on their machine and never in the data folder.
- The MCP server (`mdbase.mcpb`) makes no network call. It talks to the MCP client that launched it (for example Claude Desktop) over standard input and output. What that client reads from the folder is subject to the privacy policy of the client and of its AI provider.

## Uninstallation

The desktop application is uninstalled from the Windows settings (Apps), like any other program. The user's data folder is never deleted by the uninstaller.
