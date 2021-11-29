# https://flask-restplus.readthedocs.io/en/stable/quickstart.html#initialization
# https://github.com/hiepph/cgan-face-generator/blob/master/server.py

import werkzeug
from flask import Flask, jsonify, request, send_file
from flask_restplus import Resource, Api
import tensorflow as tf
from werkzeug.datastructures import FileStorage
import os
import base64
import string
import math
import io
import random
from PIL import Image
import shutil
import numpy as np
import torchvision.transforms as transforms
import time
from sklearn.cluster import KMeans

print('#######################')
print('#######################')
print('Starting server.py')
print('#######################')
print('#######################')


print('# load tensorflow model')
modelPath = os.path.join('/trained_model')
model = tf.keras.models.load_model(modelPath)
layers = model.layers
first_layer = layers[0]
inputImageSize = int(first_layer.input_shape[0][1] / 2)
print('inputImageSize: ' + str(inputImageSize))


app = Flask(__name__)
api = Api(app)


def error(msg):
    return jsonify({'error': msg})


def get_random_string(length):
    # choose from all lowercase letter
    letters = string.ascii_lowercase
    result_str = ''.join(random.choice(letters) for i in range(length))
    print("Random string of length", length, "is:", result_str)
    return result_str


upload_parser = api.parser()
upload_parser.add_argument('file1', location='files',
                           type=FileStorage, required=True)
upload_parser.add_argument('file2', location='files',
                           type=FileStorage, required=False)
upload_parser.add_argument('file3', location='files',
                           type=FileStorage, required=False)
upload_parser.add_argument('file4', location='files',
                           type=FileStorage, required=False)
upload_parser.add_argument(
    'minPredictionValue',
    location='args',
    type=float,
    required=True,
    default=-0.5,
    help='the minimal value that must be reached in the model ouput to make a pxiel appear in the segmentation. Value between -1 and 1'
)

app.config['Upload_folder'] = os.path.join('/upload_tmp/')
print('Upload dir: ' + app.config['Upload_folder'])
if not os.path.exists(app.config['Upload_folder']):
    os.makedirs(app.config['Upload_folder'])


@api.route('/hello')
class HelloWorld(Resource):
    def get(self):
        return {'hello': 'world'}


def resizeImageToFitIntoInputImageSize(image):
    image_size = image.size
    isWidth = image_size[0]
    isHeight = image_size[1]
    portion = isWidth / isHeight
    newWidth = isWidth
    newHeight = isHeight

    if isHeight > isWidth:
        newHeight = inputImageSize
        newWidth = math.ceil(portion * newHeight)
    else:
        newWidth = inputImageSize
        newHeight = math.ceil(newWidth / portion)

    imageThatFitsIntoBox = image.resize((newWidth, newHeight), Image.ANTIALIAS)
    # imageThatFitsIntoBox.save(os.path.join(app.config['Upload_folder'], str(time.time()) + get_random_string(4) + '-intobox.jpg'))
    return imageThatFitsIntoBox


def resizeImage(image_file):
    # resize image
    # https://stackoverflow.com/a/44371790/3443137
    image = Image.open(image_file)
    image = resizeImageToFitIntoInputImageSize(image)
    image_size = image.size
    width = image_size[0]
    height = image_size[1]

    background = Image.new(
        'RGB', (inputImageSize, inputImageSize), (255, 255, 255))
    offset = (int(round(((inputImageSize - width) / 2), 0)),
              int(round(((inputImageSize - height) / 2), 0)))
    background.paste(image, offset)

    return background


def mergeImages(images):
    background = Image.new(
        'RGB', (inputImageSize * 2, inputImageSize * 2), (255, 255, 255))
    background.paste(images[0], (0, 0))
    background.paste(images[1], (inputImageSize, 0))
    background.paste(images[2], (0, inputImageSize))
    background.paste(images[3], (inputImageSize, inputImageSize))
    return background


def normalizeSingle(input_image):
    input_image = (input_image / 127.5) - 1
    return input_image


@api.route('/predict')
@api.expect(upload_parser)
class Prediction(Resource):
    def post(self):
        requestFlag = str(time.time())
        requestTmpFolder = os.path.join(
            app.config['Upload_folder'], requestFlag)
        args = upload_parser.parse_args()
        print(args)

        # save files to tmp dir
        os.makedirs(requestTmpFolder)
        uploadedImages = [args['file1']]
        if hasattr(args, 'file2'):
            uploadedImages.append(args['file2'])
        if hasattr(args, 'file3'):
            uploadedImages.append(args['file3'])
        if hasattr(args, 'file4'):
            uploadedImages.append(args['file4'])

        while len(uploadedImages) < 4:
            uploadedImages.append(args['file1'])

        imagePaths = []
        for i in range(len(uploadedImages)):
            uploadedImage = uploadedImages[i]
            imagePath = os.path.join(requestTmpFolder, str(i) + '.jpg')
            uploadedImage.save(imagePath)
            imagePaths.append(imagePath)

        resized = []
        for imagePath in imagePaths:
            resized.append(resizeImage(imagePath))

        merged = mergeImages(resized)
        mergedPath = os.path.join(requestTmpFolder, 'merged.jpg')
        merged.save(mergedPath)

        modelInputImage = tf.io.read_file(mergedPath)
        modelInputImage = tf.image.decode_jpeg(modelInputImage)
        modelInputImage = tf.cast(modelInputImage, tf.float32)
        modelInputImage = normalizeSingle(modelInputImage)
        modelInputImage = np.expand_dims(modelInputImage, axis=0)

        prediction = model(modelInputImage, training=False)
        predictionAr = prediction.numpy()

        minPredictionValue = args['minPredictionValue']
        print('minPredictionValue: ' + str(minPredictionValue))
        inputImage = Image.open(mergedPath)
        inputPixels = np.asarray(inputImage)
        allPixels = np.zeros(
            (inputImageSize * 2, inputImageSize * 2, 4), dtype=np.uint8)
        usedPixels = 0
        for rowIdx in range(len(predictionAr[0])):
            predictionRow = predictionAr[0][rowIdx]
            inputRow = inputPixels[rowIdx]
            for pixelIdx in range(len(predictionRow)):
                inputPixel = inputRow[pixelIdx]
                predictionPixel = predictionRow[pixelIdx][0]
                alphaChannelValue = 0
                if predictionPixel < minPredictionValue:
                    usedPixels = usedPixels + 1
                    alphaChannelValue = 255
                allPixels[rowIdx, pixelIdx] = [
                    inputPixel[0],
                    inputPixel[1],
                    inputPixel[2],
                    alphaChannelValue
                ]
        if usedPixels == 0:
            raise ValueError('usedPixels is zero')
        else:
            print('usedPixels: ' + str(usedPixels))

        # print(allPixels)
        predictionImage = Image.fromarray(allPixels, 'RGBA')
        predictionPath = os.path.join(requestTmpFolder, 'prediction.png')
        predictionImage.save(predictionPath)


        # put image into memory so we can clean up and still have the image
        # https://www.dreamincode.net/forums/topic/420456-sending-image-as-response-with-flask/
        file_object = io.BytesIO()
        predictionImage.save(file_object, 'png')
        file_object.seek(0)

        # clean up
        shutil.rmtree(requestTmpFolder)

        return send_file(
            file_object,
            attachment_filename='prediction.jpg',
            mimetype='image/png'
        )

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
