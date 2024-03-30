# crrr

Lightning fast interactive directory switcher. Inspired by Primeagen's flow.

## Controls

Arrow keys to move the cursor up and down.

`<` to cd into current directory and exit. `>` to cd into
directory selected by the cursor and exit, or open selected file in `$EDITOR` (default is `vim`) if
the selected file is not a directory. `Return` to cd into directory selected by the cursor and
continue execution. `?` to toggle visibility of hidden files. `/` to reset internal state of the
app.

Start entering any text to search in the contents of the current directory.

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
