import React, { useEffect, useRef, useState } from 'react';
import { Box, Key, Newline, render, Text, useApp, useInput } from 'ink';
import fs from 'fs';
import process from 'process';

type FileInList = { name: string; isDirectory: boolean; index: number };

const outputPath = '/tmp/crrr';
const wordSeparators = [' ', '-', '_', '.'];
const defaultFilesCount = 2;
const lineOverhead = defaultFilesCount + 4;

function init() {
    if (fs.existsSync(outputPath)) {
        fs.rmSync(outputPath);
    }

    // TODO isDirectory and chdir as custom functions
    if (process.argv[2] && isDirectory(process.argv[2])) {
        changeDirectory(process.argv[2]);
    }

    spawnAlternateTerminalScreen();
}

/** System functions */
function isDirectory(path: string) {
    return fs.lstatSync(path).isDirectory();
}

function changeDirectory(path: string) {
    if (isDirectory(path)) {
        process.chdir(path);
    }
}

function getCwd() {
    return process.cwd();
}

function attachResizeListener(setSize: Function) {
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
}

function spawnAlternateTerminalScreen() {
    const enterAltScreenCommand = '\x1b[?1049h';
    const leaveAltScreenCommand = '\x1b[?1049l';
    process.stdout.write(enterAltScreenCommand);
    process.on('exit', () => {
        process.stdout.write(leaveAltScreenCommand);
    });
}

/** Utility functions */
function clipNumber(current: number, min: number, max: number) {
    return Math.min(Math.max(current, min), max);
}

function sanitizeSearchString(input: string) {
    const initialInput = input.toLowerCase();

    return wordSeparators.reduce((acc, sep) => acc.replaceAll(sep, ''), initialInput);
}

function getScrollAmount(selectedValue: number, itemCount: number, itemsPerScreen: number) {
    const halfItemsPerScreen = itemsPerScreen / 2;

    const scrollAmount = selectedValue - halfItemsPerScreen;

    return Math.max(scrollAmount, 0); //itemCount - itemsPerScreen
}

function getFiles(path: string = '.'): FileInList[] {
    return fs.readdirSync(path).map((file, index) => ({
        name: file,
        isDirectory: isDirectory(file),
        index: index,
    }));
}

function cdToCurrentPathAndExit(exit: () => void) {
    const fd = fs.openSync(outputPath, fs.constants.O_WRONLY | fs.constants.O_CREAT);

    fs.writeFileSync(fd, `${getCwd()}`);
    fs.closeSync(fd);

    exit();
}

function cdToSelectedPathAndExit(files: FileInList[], selected: number, exit: () => void) {
    const selectedFilePath = getSelectedFilePath(files, selected);

    if (isDirectory(selectedFilePath)) {
        changeDirectory(selectedFilePath);
        cdToCurrentPathAndExit(exit);
    }
}

function getSelectedFilePath(files: FileInList[], selected: number) {
    return files[selected]?.name as string;
}

function getNewShownFiles(files: FileInList[], searchString: string, showHiddenFiles: boolean) {
    const sortAndMapFiles = (files: FileInList[], indexOffset: number) =>
        files
            .sort((a, b) => (a.name < b.name ? -1 : 1))
            .map((file, index) => ({
                ...file,
                index: index + indexOffset,
            }));

    const filteredFiles = files
        .filter((file) =>
            // TODO fuzzy search
            sanitizeSearchString(file.name).includes(sanitizeSearchString(searchString)),
        )
        .filter((file) => (showHiddenFiles ? true : !file.name.startsWith('.')));

    const directories = sortAndMapFiles(
        filteredFiles.filter((file) => file.isDirectory),
        defaultFilesCount,
    );

    const nonDirectories = sortAndMapFiles(
        filteredFiles.filter((file) => !file.isDirectory),
        defaultFilesCount + directories.length,
    );

    const newDisplayedFiles = [
        { name: '.', isDirectory: true, index: 0 },
        { name: '..', isDirectory: true, index: 1 },
        ...directories,
        ...nonDirectories,
    ];

    return newDisplayedFiles;
}

function getNewSearchString(
    searchString: string,
    input: string,
    isDeleteButton: boolean,
    isDeleteWord: boolean,
) {
    if (!isDeleteButton) {
        return searchString + input;
    }

    if (!isDeleteWord) {
        return searchString.substring(0, searchString.length - 1);
    }

    const endIndex = Math.max(...wordSeparators.map((sep) => searchString.lastIndexOf(sep)));
    return searchString.substring(0, endIndex);
}

/** Hooks */

function useSelect(initial: number, maxValueInclusive: boolean = false) {
    const [selectedValue, _setSelectedValue] = useState(initial);

    const maxValueOffset = maxValueInclusive ? 0 : 1;

    const decreaseSelectedValue = (minValue: number) => {
        setSelectedValue((current) => current - 1, minValue, Number.MAX_VALUE);
    };

    const increaseSelectedValue = (maxValue: number) => {
        setSelectedValue((current) => current + 1, -Number.MAX_VALUE, maxValue);
    };

    const setSelectedValue = (
        callback: (current: number) => number,
        minValue: number,
        maxValue: number,
    ) => {
        _setSelectedValue((current) =>
            clipNumber(callback(current), minValue, maxValue - maxValueOffset),
        );
    };

    const clipSelectedValueToSafeRange = (minValue: number, maxValue: number) => {
        _setSelectedValue((current) => clipNumber(current, minValue, maxValue - maxValueOffset));
    };

    return {
        selectedValue,
        setSelectedValue,
        unsafeSetSelectedValue: _setSelectedValue,
        clipSelectedValueToSafeRange,
        decreaseSelectedValue,
        increaseSelectedValue,
    };
}

const CRRR = function () {
    const { exit } = useApp();

    const [showHiddenFiles, setShowHiddenFiles] = useState(false);
    const [searchString, setSearchString] = useState('');
    const [filesInCurrenDir, setFilesCurrentInDir] = useState(getFiles());
    const [shownFiles, setShownFiles] = useState(getNewShownFiles(getFiles(), '', false));
    const {
        selectedValue,
        setSelectedValue,
        unsafeSetSelectedValue,
        clipSelectedValueToSafeRange,
        decreaseSelectedValue,
        increaseSelectedValue,
    } = useSelect(1, false);

    const [screenSize, setScreenSize] = useState({
        columns: process.stdout.columns,
        rows: process.stdout.rows,
    });

    function handleChangeShowHiddenFiles() {
        const newShowHiddenFiles = !showHiddenFiles;
        const newShownFiles = getNewShownFiles(filesInCurrenDir, searchString, newShowHiddenFiles);

        setShowHiddenFiles(() => newShowHiddenFiles);
        setShownFiles(() => newShownFiles);
        setSelectedValue((current) => current, 0, newShownFiles.length);
    }

    function handleReturn() {
        const selectedFilePath = getSelectedFilePath(shownFiles, selectedValue);

        if (selectedValue === 0) {
            cdToCurrentPathAndExit(exit);
            return;
        }

        if (!isDirectory(selectedFilePath)) return;

        changeDirectory(selectedFilePath);
        const newFilesInCurrentDir = getFiles();
        const newShownFiles = getNewShownFiles(newFilesInCurrentDir, '', showHiddenFiles);

        setFilesCurrentInDir(() => newFilesInCurrentDir);
        setShownFiles(() => newShownFiles);
        setSelectedValue(() => 1, 0, newShownFiles.length);
        setSearchString(() => '');
    }

    function handleMoveUp(jumpToTop: boolean) {
        if (jumpToTop) {
            unsafeSetSelectedValue(() => 1);
            return;
        }

        decreaseSelectedValue(0);
    }

    function handleMoveDown(jumpToBottom: boolean) {
        if (jumpToBottom) {
            unsafeSetSelectedValue(() => shownFiles.length - 1);
            return;
        }

        increaseSelectedValue(shownFiles.length);
    }

    function handleInput(input: string, key: Key) {
        const newSearchString = getNewSearchString(
            searchString,
            input,
            key.backspace || key.delete,
            key.meta,
        );
        const newShownFiles = getNewShownFiles(filesInCurrenDir, newSearchString, showHiddenFiles);

        setShownFiles(() => newShownFiles);
        setSearchString(() => newSearchString);
        if (newSearchString === '..') {
            unsafeSetSelectedValue(() => 1);
        } else {
            // TODO remember previous selected
            clipSelectedValueToSafeRange(defaultFilesCount, newShownFiles.length);
        }
    }

    /**
     * Resize callback
     */
    useEffect(() => {
        attachResizeListener(setScreenSize);
    }, []);

    useInput((input, key) => {
        if (input === '>') {
            cdToSelectedPathAndExit(shownFiles, selectedValue, exit);
            return;
        }

        if (input === '<') {
            cdToCurrentPathAndExit(exit);
            return;
        }

        if (input === '?') {
            handleChangeShowHiddenFiles();
            return;
        }

        if (key.return) {
            handleReturn();
            return;
        }

        if (key.upArrow) {
            handleMoveUp(key.meta);
            return;
        }
        if (key.downArrow) {
            handleMoveDown(key.meta);
            return;
        }

        handleInput(input, key);
    });

    const scrollAmount = getScrollAmount(selectedValue, shownFiles.length, screenSize.rows);

    return (
        <Box flexDirection="column" width={screenSize.columns} height={screenSize.rows}>
            <Box>
                <Text>{getCwd()}</Text>
                <Newline count={1} />
            </Box>
            {shownFiles
                // TODO remove slicing logic from here
                // TODO change slicing to <amount of scrolled; amount of scrolled + screen height)
                .slice(scrollAmount, scrollAmount + screenSize.rows)
                .map((file, index) => (
                    <Box key={file.index} width={screenSize.columns}>
                        <Text>{selectedValue === index + scrollAmount ? '>' : ' '}</Text>
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

init();

render(<CRRR />);
