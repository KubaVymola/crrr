# crrr

Lightning fast interactive directory switcher.

## Controls

Arrow keys to move the cursor up and down.

`<` to cd into current directory and exit. `>` to cd into
directory selected by the cursor and exit, or open selected file in `$EDITOR` (default to `vim`) if
the selected file is not a directory. `Return` to cd into directory selected by the cursor and
continue execution. `?` to toggle visibility of hidden files. `/` to reset internal state of the
app.

Start entering any text to search in the contents of the current directory.

This app uses `/tmp` directory to create a file named `crrr` with the name of the target directory,
so that the shell can then cd into this directory. Hence this project might not currently be
suitable for multi-user systems.

## Install

```bash
# npm
$ npm install --global crrr
```

```bash
# yarn
$ yarn global add crrr
```

And add the following to your shell profile (.bashrc, .bash_profile, .zshrc, etc)

```bash
if [ -x "$(command -v init_crrr)" ]; then
  source init_crrr
fi
```

## Commands

```bash
# start crrr in the current directory
$ c
```

```bash
# start crrr in your home directory
$ ch
```

```bash
# start crrr in the root directory
$ cr
```
