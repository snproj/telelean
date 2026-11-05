No. Everything telelean does with git is local. It doesn't push, pull, use remotes or the network, use your `gh` CLI, or touch your GitHub account. It uses git in two places:

1. **History snapshots (D-33, M1).** In a model folder such as `mental_model/`, telelean records each change as a private ref (`refs/telelean/snapshots/…`) in that folder's own local repository. If the folder isn't a repository yet, the Initialize command offers to run `git init` for you. It never touches your branches, your staging area or your hooks. A plain `git push` sends branches and tags, not `refs/telelean/*`, so if you ever push that folder somewhere yourself, the snapshots stay on your machine unless you push them deliberately.
2. **Claude's shadow copy (M2).** Each run's shadow, in the extension's private storage, gets its own throwaway repository with a base commit. That is only what makes the diff for your review, and the merge when you edited your files during the run. It never leaves that folder.

Telelean's own git calls will switch off commit signing and hooks. Otherwise a git setup that signs commits with GPG, or runs commit hooks, could pop up prompts or run your scripts on every snapshot.

**The telelean code itself** (`/home/zhengyew/telelean`) isn't a git repository, and I haven't created one. I only commit when you ask, and only push if you explicitly ask; until now I haven't run `git` or `gh` against any of your repositories. If you'd like the code under version control, I can `git init` it locally on request. Pushing anywhere would be your call, with your own remote.
