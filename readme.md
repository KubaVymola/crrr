# crrr

Lightning fast interactive directory switcher. Inspired by Primeagen's flow.

## Controls

Arrow keys to move the cursor up and down. `<` to cd into current directory and exit. `>` to cd into
directory selected by the cursor and exit. `Return` to cd into directory selected by the cursor and
continue execution. `?` to toggle visibility of hidden files. Start entering any text to search in
the contents of the current directory.

## Install

```bash
# npm
$ npm install --global crrr
```

```bash
# yarn
$ yarn global add crrr
```

Add following to shell profile

# TODO

```bash
c () { crrr; }
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
