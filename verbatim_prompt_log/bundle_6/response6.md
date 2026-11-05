No, you don't need to uninstall anything. "Install Extension from Location…" doesn't copy the extension; it points VS Code at `packages/extension` where it is. So:
- when I rebuild, your installed copy picks up the new version after **Developer: Reload Window**;
- my tests never touch it, because they launch a separate VS Code test instance with its own profile.

There are two small caveats while M1 is being built:
- If you reload while I'm in the middle of a build, you might briefly get a half-built board. Reloading again after I say M1 is ready fixes it.
- If the extension's identity ever changed (its id is `telelean.telelean`), VS Code would treat it as a different extension, and you'd need to remove the old one and install the new one. I don't plan to change it.

If you'd rather keep it out of the way until M1 is ready, either of these works:
- **Disable it** (easy to undo): Extensions view (Ctrl+Shift+X), search `telelean`, then the gear icon → **Disable**.
- **Uninstall it:** the same gear icon → **Uninstall**, or in a terminal run `code --uninstall-extension telelean.telelean`. Uninstalling only removes VS Code's registration. The folder `/home/zhengyew/telelean/packages/extension` stays, and you can re-install from it later the same way.
