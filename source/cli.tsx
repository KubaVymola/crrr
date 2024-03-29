import React, { useEffect, useRef, useState } from 'react';
import { Box, Key, Newline, render, Text, useApp, useInput } from 'ink';
import fs from 'fs';
import process from 'process';

type FileInList = { name: string; isDirectory: boolean; index: number };

const outputPath = '/tmp/crrr';
const wordSeparators = [' ', '-', '_', '.'];
const defaultFilesCount = 2;
const lineOverhead = defaultFilesCount + 4;

function clipNumber(current: number, min: number, max: number) {
    return Math.min(Math.max(current, min), max);
}

function sanitizeSearchString(input: string) {
    const initialInput = input.toLowerCase();

    return wordSeparators.reduce((acc, sep) => acc.replaceAll(sep, ''), initialInput);
}

function getFilesStartSliceIndex(selected: number, filesLength: number, listHeight: number) {
    const halfList = listHeight / 2;

    const startIndex = selected - halfList - Math.max(0, selected + halfList - filesLength);

    return clipNumber(startIndex, 0, filesLength);
}

function getFilesEndSliceIndex(selected: number, filesLength: number, listHeight: number) {
    const halfList = listHeight / 2;

    const endIndex = selected + halfList - Math.min(0, selected - halfList);

    return clipNumber(endIndex, 0, filesLength);
}

function useSelect({ initial = 0 }: { initial?: number }) {
    const [selected, setSelected] = useState(initial);

    const moveUp = () => {
        setSelected((current) => Math.max(0, current - 1));
    };
    const moveDown = () => {
        setSelected((current) => Math.max(0, current + 1));
    };

    return {
        selected,
        setSelected,
        moveUp,
        moveDown,
    };
}

function getFiles(rootPath: string): FileInList[] {
    return fs.readdirSync(rootPath).map((file, index) => ({
        name: file,
        isDirectory: fs.lstatSync(file).isDirectory(),
        index: index,
    }));
}

function cdToCurrentPathAndExit(exit: () => void) {
    const fd = fs.openSync(outputPath, fs.constants.O_WRONLY | fs.constants.O_CREAT);

    fs.writeFileSync(fd, `${process.cwd()}`);
    fs.closeSync(fd);

    exit();
}

function cdToSelectedPathAndExit(files: FileInList[], selected: number, exit: () => void) {
    const selectedFilePath = getSelectedFilePath(files, selected);

    if (fs.lstatSync(selectedFilePath).isDirectory()) {
        process.chdir(selectedFilePath);
        cdToCurrentPathAndExit(exit);
    }
}

function getSelectedFilePath(files: FileInList[], selected: number) {
    return files[selected]?.name as string;
}

function getFilteredFiles(files: FileInList[], searchString: string, hiddenVisible: boolean) {
    return files
        .filter((file) =>
            // TODO fuzzy search
            sanitizeSearchString(file.name).includes(sanitizeSearchString(searchString)),
        )
        .filter((file) => (hiddenVisible ? true : !file.name.startsWith('.')));
}

function getDisplayFiles(filteredFiles: FileInList[]) {
    const directories = filteredFiles
        .filter((file) => file.isDirectory)
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .map((file, index) => ({
            ...file,
            index: index + defaultFilesCount,
        }));

    const nonDirectories = filteredFiles
        .filter((file) => !file.isDirectory)
        .sort((a, b) => (a.name < b.name ? -1 : 1))
        .map((file, index) => ({
            ...file,
            index: index + defaultFilesCount + directories.length,
        }));

    const newDisplayedFiles = [
        { name: '.', isDirectory: true, index: 0 },
        { name: '..', isDirectory: true, index: 1 },
        ...directories,
        ...nonDirectories,
    ];

    return newDisplayedFiles;
}

const CRRR = function () {
    const { exit } = useApp();

    const pathRef = useRef(process.cwd());

    const [hiddenVisible, setHiddenVisible] = useState(false);
    const [searchString, setSearchString] = useState('');
    const [filesInDir, setFilesInDir] = useState(getFiles('.'));
    const [filteredFiles, setFilteredFiles] = useState(getFilteredFiles(getFiles('.'), '', false));
    const [displayFiles, setDisplayedFiles] = useState(
        getDisplayFiles(getFilteredFiles(getFiles('.'), '', false)),
    );

    const { selected, setSelected, moveUp, moveDown } = useSelect({
        initial: 1,
    });

    const [size, setSize] = useState({
        columns: process.stdout.columns,
        rows: process.stdout.rows,
    });

    function handleReturn() {
        const selectedFilePath = getSelectedFilePath(displayFiles, selected);

        if (selectedFilePath === '.') {
            cdToCurrentPathAndExit(exit);
        }

        if (fs.lstatSync(selectedFilePath).isDirectory()) {
            process.chdir(selectedFilePath);
            setFilesInDir(() => getFiles('.'));
        }
    }

    function handleChangeHiddenVisible() {
        setHiddenVisible((current) => !current);
    }

    function handleInput(input: string, key: Key) {
        if (key.backspace || key.delete) {
            if (key.meta) {
                const endIndex = Math.max(
                    ...wordSeparators.map((sep) => searchString.lastIndexOf(sep)),
                );
                const endIndexTrimmed = Math.max(endIndex, 0);
                setSearchString((current) => current.substring(0, endIndexTrimmed));
            } else {
                setSearchString((current) => current.substring(0, current.length - 1));
            }

            return;
        }

        setSearchString((current) => current + input);
    }

    /**
     * Filter files based on hiddenVisible and searchString
     * Also modifies selected
     */
    useEffect(() => {
        setFilteredFiles(() => getFilteredFiles(filesInDir, searchString, hiddenVisible));

        if (pathRef.current === process.cwd()) {
            if (searchString === '..') {
                setSelected(() => 1);
            } else if (searchString.length > 0 && selected < defaultFilesCount) {
                setSelected(() => defaultFilesCount);
            }
        } else {
            setSelected(1);
            setSearchString('');
        }

        pathRef.current = process.cwd();
    }, [filesInDir, searchString, hiddenVisible]);

    /**
     * Clip selected into safe range
     */
    useEffect(() => {
        if (selected < 0) setSelected(() => 0);
        if (selected > displayFiles.length - 1) setSelected(() => displayFiles.length - 1);
    }, [selected]);

    /**
     * Set displayed files and clip selected to safe range
     */
    useEffect(() => {
        const newDisplayedFiles = getDisplayFiles(filteredFiles);

        setSelected((current) => clipNumber(current, 0, newDisplayedFiles.length - 1));
        setDisplayedFiles(() => newDisplayedFiles);
    }, [filteredFiles]);

    /**
     * Resize callback
     */
    useEffect(() => {
        function onResize() {
            setSize({
                columns: process.stdout.columns,
                rows: process.stdout.rows,
            });
        }

        process.stdout.on('resize', onResize);
        return () => {
            process.stdout.off('resize', onResize);
        };
    }, []);

    useInput((input, key) => {
        if (input === '>') {
            cdToSelectedPathAndExit(displayFiles, selected, exit);
            return;
        }

        if (input === '<') {
            cdToCurrentPathAndExit(exit);
            return;
        }

        if (input === '?') {
            handleChangeHiddenVisible();
            return;
        }

        if (key.return) {
            handleReturn();
            return;
        }

        if (key.upArrow) {
            if (key.meta) {
                setSelected(() => 1);
            } else {
                moveUp();
            }
            return;
        }
        if (key.downArrow) {
            if (key.meta) {
                setSelected(() => displayFiles.length - 1);
            } else {
                moveDown();
            }
            return;
        }

        handleInput(input, key);
    });

    return (
        <Box flexDirection="column" width={size.columns} height={size.rows}>
            <Box>
                <Text>{process.cwd()}</Text>
                <Newline count={1} />
            </Box>
            {displayFiles
                .slice(
                    getFilesStartSliceIndex(
                        selected,
                        displayFiles.length,
                        size.rows - lineOverhead,
                    ),
                    getFilesEndSliceIndex(selected, displayFiles.length, size.rows - lineOverhead),
                )
                .map((file) => (
                    <Box key={file.index}>
                        {selected === file.index ? <Text>{'>'}</Text> : <Text> </Text>}
                        <Text {...(file.isDirectory && { backgroundColor: 'blue' })}>
                            {` ${String(file.name)} `}
                        </Text>
                    </Box>
                ))}

            <Newline count={1} />
            <Box>
                <Text inverse>
                    {'> '}
                    {searchString}
                </Text>
            </Box>
        </Box>
    );
};

if (fs.existsSync(outputPath)) {
    fs.rmSync(outputPath);
}

const enterAltScreenCommand = '\x1b[?1049h';
const leaveAltScreenCommand = '\x1b[?1049l';
process.stdout.write(enterAltScreenCommand);
process.on('exit', () => {
    process.stdout.write(leaveAltScreenCommand);
});

if (process.argv[2] && fs.lstatSync(process.argv[2]).isDirectory()) {
    process.chdir(process.argv[2]);
}

render(<CRRR />);
