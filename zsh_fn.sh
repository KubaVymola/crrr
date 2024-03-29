c () {
    node /Users/jakub/Programming/crrr/dist/cli.js "$1"

    if [ -f "/tmp/crrr" ]; then
        cd $(cat /tmp/crrr)
        rm /tmp/crrr

    fi
}

ch () {
    c ~
}

cr () {
    c /
}
