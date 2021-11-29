/**
 * This example loads 4 images of the same fashion item
 * and sends the to the served model.
 */

import * as path from 'path';
import * as fs from 'fs';
import sharp, { Sharp } from 'sharp';
import got from 'got';
const FormData = require('form-data');
import { clearFolder, keyWithHighestValue } from './util';
import { ColorRatio, Dimensions } from './types';
const quantize = require('quantize');
const rgbHex = require('rgb-hex');

const inputDir = path.join(__dirname, '../input');
console.log('inputDir: ' + inputDir);
const allOutputDir = path.join(__dirname, '../', 'output');

/**
 * If you need a model with higher resolution you can contact me.
 * (check the README.md)
 */
const singleImageSize = 128;
const singeImageDimensions: Dimensions = {
    width: singleImageSize,
    height: singleImageSize
};


/**
 * Every pixel with a model output of less then the activation signal,
 * will be used in the bitmap and the color detection.
 * Value between -1 and 1.
 * When you decrease this value you have less false positives but more false negatives.
 * When you increase this value you have more false positives but less false negatives.
 */
const activationSignal = -0.7;
const serverUrl = 'http://localhost:5000/predict?minPredictionValue=' + activationSignal;

async function run() {
    await clearFolder(allOutputDir);

    const itemFolders = fs.readdirSync(inputDir);
    console.dir(itemFolders);

    for (const itemFolder of itemFolders) {

        const imagesDir = path.join(inputDir, itemFolder);
        const outputDir = path.join(allOutputDir, itemFolder);
        await clearFolder(outputDir);

        const imageFileNames = fs
            .readdirSync(imagesDir)
            .filter(name => name.endsWith('.jpg'));
        if (imageFileNames.length < 4) {
            throw new Error('folder(' + imagesDir + ') has too less images ' + imagesDir + ', you need at least 4 of them. (You can also copy the exisiting ones)');
        }

        const form = new FormData();
        const inputImagePaths: string[] = [];
        imageFileNames.forEach((imageFileName, idx) => {
            const fileId = idx + 1;
            const imagePath = path.join(imagesDir, imageFileName);
            console.log('imagePath: ' + imagePath);
            inputImagePaths.push(imagePath);
            form.append('file' + fileId, fs.createReadStream(imagePath));
        });

        // used for debugging
        const inputImageBuffers: Buffer[] = [];
        for (const imagePath of inputImagePaths) {
            const image = await sharp(imagePath);
            const resized = await resizeToDimension(image, singeImageDimensions);
            const imageBuffer = await resized.toBuffer();
            inputImageBuffers.push(imageBuffer);
        }
        const endInputImage = sharp({
            create: {
                width: singleImageSize * 2,
                height: singleImageSize * 2,
                background: 'white',
                channels: 3
            }
        }).composite(
            [
                {
                    input: inputImageBuffers[0],
                    top: 0,
                    left: 0
                },
                {
                    input: inputImageBuffers[1],
                    top: 0,
                    left: singleImageSize
                },
                {
                    input: inputImageBuffers[2],
                    top: singleImageSize,
                    left: 0
                },
                {
                    input: inputImageBuffers[3],
                    top: singleImageSize,
                    left: singleImageSize
                }
            ]
        ).jpeg({
            quality: 100,
            chromaSubsampling: '4:4:4'
        });
        await endInputImage.toFile(path.join(outputDir, './input.jpg'));


        let segmentedImage: Sharp;
        try {
            const response = await got.post(serverUrl, {
                body: form
            }) as any;
            segmentedImage = await sharp(response.rawBody);
        } catch (error) {
            console.error('# request failed');
            console.dir(error.response);
            throw error;
        }

        await segmentedImage.clone().toFile(path.join(outputDir, './segmentated.png'));
        const imageMeta = await segmentedImage.metadata();
        const buffer = await segmentedImage
            .raw()
            .toBuffer();

        // contains all pixels with an alpha channel value of 255
        const segmentatedPixels: number[][] = [];
        // contains all segmentatedPixels but only as black or white
        const bitmapPixels: number[] = [];
        let b = 0;
        for (let h = 0; h < imageMeta.width; h++) {
            for (let w = 0; w < imageMeta.height; w++) {
                const rgb = [
                    buffer[b++],
                    buffer[b++],
                    buffer[b++]
                ];
                const alpha = buffer[b++];
                if (alpha === 255) {
                    bitmapPixels.push(0);
                    bitmapPixels.push(0);
                    bitmapPixels.push(0);
                    segmentatedPixels.push(rgb);
                } else {
                    bitmapPixels.push(255);
                    bitmapPixels.push(255);
                    bitmapPixels.push(255);
                }
            }
        }

        console.log('# save output bitmap');
        const bitmapPath = path.join(outputDir, './bitmap.jpg');
        await sharp(Buffer.from(bitmapPixels), {
            raw: {
                width: imageMeta.width,
                height: imageMeta.height,
                channels: 3
            }
        }).toFile(bitmapPath);


        const colorRatio = await quantizeColorsOfPixels(segmentatedPixels);
        fs.writeFileSync(
            path.join(outputDir, 'colors.json'),
            JSON.stringify(colorRatio, null, 4),
            'utf8'
        );
    }

    console.log(' DONE! check the output folder at ' + allOutputDir);

}


run();



/**
 * Resize the image so it fits into the given dimensions.
 * Fills the empty space with white color.
 */
export async function resizeToDimension(
    img: Sharp,
    dimensions: Dimensions
): Promise<Sharp> {
    return img
        .resize({
            background: '#ffffff',
            fit: 'contain',
            height: dimensions.height,
            width: dimensions.width
        })
        .jpeg({
            quality: 100,
            chromaSubsampling: '4:4:4'
        })
}

/**
 * Read out and cluster all non-transparent pixels of the image.
 * pixels are in the format [r,g,b][]
 */
export async function quantizeColorsOfPixels(pixels: number[][]): Promise<ColorRatio[]> {
    const colorMap = quantize(pixels, 5);
    const perCluster: { [k: string]: number } = {};
    pixels.forEach(px => {
        const isCluster = colorMap.map(px);
        const str = isCluster.join(',');
        if (!perCluster[str]) {
            perCluster[str] = 0;
        }
        perCluster[str] = perCluster[str] + 1;
    });

    // remove small clusters
    const heighestKey = keyWithHighestValue(perCluster);
    const min = perCluster[heighestKey as any] / 8;
    let keepSum = 0;
    Object.keys(perCluster).forEach(key => {
        if (perCluster[key] < min) {
            delete perCluster[key];
        } else {
            keepSum += perCluster[key];
        }
    });

    let percentSum = 0;
    if (Object.keys(perCluster).length === 0) {
        // unknown why this happens, log stuff out to debug later
        throw new Error('quantizeColorsOfPixels() got no clusters, usePixels.length: ' + pixels.length);
    }
    const ret: ColorRatio[] = Object.entries(perCluster).map(([k, amount]) => {
        const rgb = k.split(',').map(str => parseInt(str, 10));
        const hexColor = '#' + rgbHex(rgb[0], rgb[1], rgb[2]);
        const percentage = Math.floor((amount / keepSum * 100));
        percentSum += percentage;
        return {
            hex: hexColor,
            percentage
        };
    });

    const missingBecauseOfRounding = 100 - percentSum;
    ret[0].percentage = ret[0].percentage + missingBecauseOfRounding;

    return ret;
}
