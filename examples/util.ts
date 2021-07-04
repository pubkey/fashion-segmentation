import * as fs from 'fs';
const rimraf = require('rimraf');

/**
 * @link https://stackoverflow.com/a/4550514/3443137
 */
export function randomOfArray<T>(array: T[]): T {
    const randomElement = array[Math.floor(Math.random() * array.length)];
    return randomElement;
}

export function lastOfArray<T>(ar: T[]): T {
    return ar[ar.length - 1];
}

/**
 * Shuffles array in place.
 * @param a items An array containing the items.
 */
export function shuffleArray<T>(a: T[]): T[] {
    let j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}

/**
 * Split the array into X chunks
 */
export function sliceArrayIntoChunks<T>(arr: T[], chunksAmount: number): T[][] {
    const res: T[][] = [];
    const chunkSize = Math.ceil(arr.length / chunksAmount);

    let currentChunk: T[] = [];
    arr.forEach(item => {
        currentChunk.push(item);
        if (currentChunk.length >= chunkSize) {
            res.push(currentChunk);
            currentChunk = [];
        }
    });
    res.push(currentChunk);
    return res;
}

/**
 * ensure that the given folder exists
 */
export function ensureFolderExists(folderPath: string): void {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

/**
 * deletes and recreates the folder
 */
export async function clearFolder(folderPath: string): Promise<void> {
    // only remove if exists to not raise warning
    if (fs.existsSync(folderPath)) {
        await new Promise(res => {
            rimraf(folderPath, res);
        });
    }
    ensureFolderExists(folderPath);
}

export function wait(timeInMs: number): Promise<void> {
    return new Promise(res => setTimeout(res, timeInMs));
}

/**
 * @link https://stackoverflow.com/a/27376421/3443137
 */
export function keyWithHighestValue(obj: { [k: string]: number }): string | null {
    const keys = Object.keys(obj);
    if (keys.length === 0) {
        return null;
    }
    return keys.reduce((a, b) => obj[a] > obj[b] ? a : b);
}
