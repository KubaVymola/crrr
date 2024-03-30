#!/usr/bin/env node

import React, { useEffect, useState } from 'react';
import { Box, Key, Newline, render, Text, useApp, useInput } from 'ink';
import fs from 'fs';
import process from 'process';
import Fuse, { IFuseOptions } from 'fuse.js';
import { execSync } from 'child_process';

type FileInList = { name: string; isDirectory: boolean };

const editor = process.env?.['EDITOR'] || 'vim';
const outputPath = '/tmp/crrr';
const wordSeparators = [' ', '-', '_', '.'];
const defaultFiles = [
    { name: '.', isDirectory: true },
    { name: '..', isDirectory: true },
];
const defaultFilesCount = defaultFiles.length;
const lineOverhead = defaultFilesCount + 4;
const selectedFileNamesCache = new Map<string, string>();

function init() {
    if (fs.existsSync(outputPath)) {
        fs.rmSync(outputPath);
    }

    const initialPath = process.argv[process.argv.length - 1];

    if (initialPath && isDirectory(initialPath)) {
        changeDirectory(initialPath);
    }

    spawnAlternateTerminalScreen();
}

/** System functions */
function isDirectory(fileName: string) {
    return fs.lstatSync(fileName).isDirectory();
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

function getScrollAmount(selectedValue: number, itemCount: number, itemsPerScreen: number) {
    const halfItemsPerScreen = itemsPerScreen / 2;

    const scrollAmount = selectedValue - halfItemsPerScreen;

    return clipNumber(scrollAmount, 0, Math.max(0, itemCount - itemsPerScreen));
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
    const selectedFileName = getSelectedFileName(files, selected);

    if (isDirectory(selectedFileName)) {
        changeDirectory(selectedFileName);
        cdToCurrentPathAndExit(exit);
    } else {
        execSync(`${editor} ${selectedFileName}`, {
            shell: '/bin/sh',
            stdio: 'inherit',
        });
    }
}

function getSelectedFileName(files: FileInList[], selected: number) {
    return files[selected]?.name as string;
}

function getSortedFiles(filesToSort: FileInList[], searchString: string) {
    const sortHandler = (a: FileInList, b: FileInList) => (a.name < b.name ? -1 : 1);

    if (searchString === '') return filesToSort.sort(sortHandler);

    const options: IFuseOptions<FileInList> = {
        includeScore: true,
        isCaseSensitive: false,
        shouldSort: true,
        threshold: 0.5,
        keys: ['name'],
    };

    const fuse = new Fuse(filesToSort, options);
    return fuse.search(searchString).map((value) => value.item);
}

function getNewShownFiles(files: FileInList[], searchString: string, showHiddenFiles: boolean) {
    const filteredFiles = files.filter((file) =>
        showHiddenFiles ? true : !file.name.startsWith('.'),
    );

    const directories = filteredFiles.filter((file) => file.isDirectory);
    const nonDirectories = filteredFiles.filter((file) => !file.isDirectory);

    const directoriesSorted = getSortedFiles(directories, searchString);
    const nonDirectoriesSorted = getSortedFiles(nonDirectories, searchString);

    return [...defaultFiles, ...directoriesSorted, ...nonDirectoriesSorted];
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

function getSelectedValueOnFilterChange(
    oldShownFiles: FileInList[],
    newShownFiles: FileInList[],
    selectedValue: number,
) {
    for (let i = selectedValue; i >= 0; --i) {
        const fileName = getSelectedFileName(oldShownFiles, i);

        const newSelectedValue = newShownFiles.findIndex((file) => file.name === fileName);

        if (newSelectedValue >= 0) {
            return newSelectedValue;
        }
    }

    return 0;
}

function getSelectedValueOnDirectoryChange(newShownFiles: FileInList[], currentDir: string) {
    const oldFileNameCacheHit = selectedFileNamesCache.get(currentDir);

    if (!oldFileNameCacheHit) return 1;

    const newSelectedValue = newShownFiles.findIndex((val) => val.name === oldFileNameCacheHit);

    if (newSelectedValue < 0) return 1;
    return newSelectedValue;
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
    const [_, setRerender] = useState(0); // force rerender after closing editor

    const [screenSize, setScreenSize] = useState({
        columns: process.stdout.columns,
        rows: process.stdout.rows,
    });

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

    function handleReturn() {
        const selectedFileName = getSelectedFileName(shownFiles, selectedValue);

        if (selectedValue === 0) {
            cdToCurrentPathAndExit(exit);
            return;
        }

        if (!isDirectory(selectedFileName)) return;

        selectedFileNamesCache.set(getCwd(), getSelectedFileName(shownFiles, selectedValue));
        changeDirectory(selectedFileName);

        const newFilesInCurrentDir = getFiles();
        const newShownFiles = getNewShownFiles(newFilesInCurrentDir, '', showHiddenFiles);
        const newSelectedValue = getSelectedValueOnDirectoryChange(newShownFiles, getCwd());

        setFilesCurrentInDir(() => newFilesInCurrentDir);
        setShownFiles(() => newShownFiles);
        setSelectedValue(() => newSelectedValue, 0, newShownFiles.length);
        setSearchString(() => '');
    }

    function handleChangeShowHiddenFiles() {
        const newShowHiddenFiles = !showHiddenFiles;
        const newShownFiles = getNewShownFiles(filesInCurrenDir, searchString, newShowHiddenFiles);
        const newSelectedValue = getSelectedValueOnFilterChange(
            shownFiles,
            newShownFiles,
            selectedValue,
        );

        setShowHiddenFiles(() => newShowHiddenFiles);
        setShownFiles(() => newShownFiles);
        setSelectedValue(() => newSelectedValue, 0, newShownFiles.length);
    }

    function handleResetInternalState() {
        const newShownFiles = getNewShownFiles(filesInCurrenDir, '', showHiddenFiles);

        setShownFiles(() => newShownFiles);
        setSelectedValue(() => 1, 0, newShownFiles.length);
        setSearchString(() => '');
        selectedFileNamesCache.clear();
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

        if (newShownFiles.length <= defaultFilesCount) {
            clipSelectedValueToSafeRange(0, defaultFilesCount);
        } else if (newSearchString === '..') {
            unsafeSetSelectedValue(() => 1);
        } else {
            unsafeSetSelectedValue(() => defaultFilesCount);
        }
    }

    useEffect(() => {
        const clearResizeHandler = attachResizeListener(setScreenSize);

        return () => {
            clearResizeHandler();
        };
    }, []);

    useInput((input, key) => {
        if (key.upArrow) {
            handleMoveUp(key.meta);
            return;
        }
        if (key.downArrow) {
            handleMoveDown(key.meta);
            return;
        }

        if (input === '>') {
            cdToSelectedPathAndExit(shownFiles, selectedValue, exit);
            setRerender((current) => current + 1);
            return;
        }

        if (input === '<') {
            cdToCurrentPathAndExit(exit);
            return;
        }

        if (key.return) {
            handleReturn();
            return;
        }

        if (input === '?') {
            handleChangeShowHiddenFiles();
            return;
        }

        if (input === '/') {
            handleResetInternalState();
            return;
        }

        handleInput(input, key);
    });

    const scrollAmount = getScrollAmount(
        selectedValue,
        shownFiles.length,
        screenSize.rows - lineOverhead,
    );

    return (
        <Box flexDirection="column" width={screenSize.columns} height={screenSize.rows}>
            <Box>
                <Text backgroundColor="magenta">{getCwd()}</Text>
                <Newline count={1} />
            </Box>
            {shownFiles
                .slice(scrollAmount, scrollAmount + screenSize.rows - lineOverhead)
                .map((file, index) => (
                    <Box key={index + scrollAmount} width={screenSize.columns}>
                        <Text>{selectedValue === index + scrollAmount ? '>' : ' '}</Text>
                        <Text {...(file.isDirectory && { backgroundColor: 'blue' })}>
                            {` ${String(file.name)} `}
                        </Text>
                    </Box>
                ))}

            {/* <Newline count={1} /> */}
            <Box flexGrow={1} />
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
