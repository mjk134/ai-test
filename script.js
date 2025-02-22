console.log('Hello TensorFlow');

import {MnistData} from './data.js';

async function showExamples(data) {
  // Create a container in the visor
  const surface =
    tfvis.visor().surface({ name: 'Input Data Examples', tab: 'Input Data'});  

  // Get the examples
  const examples = data.nextTestBatch(50);
  const numExamples = examples.xs.shape[0];
  
  // Create a canvas element to render each example
  for (let i = 0; i < numExamples; i++) {
    const imageTensor = tf.tidy(() => {
      // Reshape the image to 28x28 px
      return examples.xs
        .slice([i, 0], [1, examples.xs.shape[1]])
        .reshape([28, 28, 1]);
    });
    
    const canvas = document.createElement('canvas');
    canvas.width = 28;
    canvas.height = 28;
    canvas.style = 'margin: 4px;';
    await tf.browser.toPixels(imageTensor, canvas);
    surface.drawArea.appendChild(canvas);

    imageTensor.dispose();
  }
}

function getModel() {
    const model = tf.sequential();
    
    const IMAGE_WIDTH = 28;
    const IMAGE_HEIGHT = 28;
    const IMAGE_CHANNELS = 1;  
    
    // In the first layer of our convolutional neural network we have 
    // to specify the input shape. Then we specify some parameters for 
    // the convolution operation that takes place in this layer.
    model.add(tf.layers.conv2d({
      inputShape: [IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_CHANNELS],
      kernelSize: 5,
      filters: 8,
      strides: 1,
      activation: 'relu',
      kernelInitializer: 'varianceScaling'
    }));
  
    // The MaxPooling layer acts as a sort of downsampling using max values
    // in a region instead of averaging.  
    model.add(tf.layers.maxPooling2d({poolSize: [2, 2], strides: [2, 2]}));
    
    // Repeat another conv2d + maxPooling stack. 
    // Note that we have more filters in the convolution.
    model.add(tf.layers.conv2d({
      kernelSize: 5,
      filters: 16,
      strides: 1,
      activation: 'relu',
      kernelInitializer: 'varianceScaling'
    }));
    model.add(tf.layers.maxPooling2d({poolSize: [2, 2], strides: [2, 2]}));
    
    // Now we flatten the output from the 2D filters into a 1D vector to prepare
    // it for input into our last layer. This is common practice when feeding
    // higher dimensional data to a final classification output layer.
    model.add(tf.layers.flatten());
  
    // Our last layer is a dense layer which has 10 output units, one for each
    // output class (i.e. 0, 1, 2, 3, 4, 5, 6, 7, 8, 9).
    const NUM_OUTPUT_CLASSES = 10;
    model.add(tf.layers.dense({
      units: NUM_OUTPUT_CLASSES,
      kernelInitializer: 'varianceScaling',
      activation: 'softmax'
    }));
  
    
    // Choose an optimizer, loss function and accuracy metric,
    // then compile and return the model
    const optimizer = tf.train.adam();
    model.compile({
      optimizer: optimizer,
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy'],
    });
  
    return model;
  }

  async function train(model, data) {
    const metrics = ['loss', 'val_loss', 'acc', 'val_acc'];
    const container = {
      name: 'Model Training', tab: 'Model', styles: { height: '1000px' }
    };
    const fitCallbacks = tfvis.show.fitCallbacks(container, metrics);
    
    const BATCH_SIZE = 512;
    const TRAIN_DATA_SIZE = 5500;
    const TEST_DATA_SIZE = 1000;
  
    const [trainXs, trainYs] = tf.tidy(() => {
      const d = data.nextTrainBatch(TRAIN_DATA_SIZE);
      return [
        d.xs.reshape([TRAIN_DATA_SIZE, 28, 28, 1]),
        d.labels
      ];
    });
  
    const [testXs, testYs] = tf.tidy(() => {
      const d = data.nextTestBatch(TEST_DATA_SIZE);
      return [
        d.xs.reshape([TEST_DATA_SIZE, 28, 28, 1]),
        d.labels
      ];
    });
  
    return model.fit(trainXs, trainYs, {
      batchSize: BATCH_SIZE,
      validationData: [testXs, testYs],
      epochs: 10,
      shuffle: true,
      callbacks: fitCallbacks
    });
  }

async function run() {  
  const data = new MnistData();
  await data.load();
  await showExamples(data);
  const model = getModel();
  tfvis.show.modelSummary({name: 'Model Architecture', tab: 'Model'}, model);
  
  await train(model, data);
  await showAccuracy(model, data);
  await showConfusion(model, data);
  document.getElementById('predict-button').addEventListener('click', function (e) {
    let tempCanvas = document.createElement('canvas');
    let tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = 28;
    tempCanvas.height = 28;
    tempCtx.drawImage(ctx.canvas, 0, 0, 280, 280, 0, 0, 28, 28);
    document.body.appendChild(tempCanvas)
    
    let imageData = tempCtx.getImageData(0, 0, 28, 28);
    let data = imageData.data;
    let grayscaleData = new Array(28 * 28);
    for (let i = 0; i < 28; i++) {
        for (let j = 0; j < 28; j++) {
            let k = i * 28 * 4 + j * 4;
            grayscaleData[i * 28 + j] = data[k] / 255.0;
        }
    }

    let tensor = tf.tensor4d(grayscaleData, [1, 28, 28, 1]);
    let preds = model.predict(tensor);
    let predictedNumber = preds.argMax(1).dataSync()[0];

    document.getElementById('prediction').innerText = 'Predicted number: ' + predictedNumber;
});
document.getElementById('clear-button').addEventListener('click', function (e) {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
});
}


const classNames = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

function doPrediction(model, data, testDataSize = 500) {
  const IMAGE_WIDTH = 28;
  const IMAGE_HEIGHT = 28;
  const testData = data.nextTestBatch(testDataSize);
  const testxs = testData.xs.reshape([testDataSize, IMAGE_WIDTH, IMAGE_HEIGHT, 1]);
  const labels = testData.labels.argMax(-1);
  const preds = model.predict(testxs).argMax(-1);

  testxs.dispose();
  return [preds, labels];
}


async function showAccuracy(model, data) {
  const [preds, labels] = doPrediction(model, data);
  const classAccuracy = await tfvis.metrics.perClassAccuracy(labels, preds);
  const container = {name: 'Accuracy', tab: 'Evaluation'};
  tfvis.show.perClassAccuracy(container, classAccuracy, classNames);

  labels.dispose();
}

async function showConfusion(model, data) {
  const [preds, labels] = doPrediction(model, data);
  const confusionMatrix = await tfvis.metrics.confusionMatrix(labels, preds);
  const container = {name: 'Confusion Matrix', tab: 'Evaluation'};
  tfvis.render.confusionMatrix(container, {values: confusionMatrix, tickLabels: classNames});

  labels.dispose();
}   
  
let mousePressed = false;
let lastX, lastY;
let ctx;

function init() {
    ctx = document.getElementById('c').getContext("2d");
    // fill the canvas with black
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);


    document.getElementById('c').addEventListener('mousedown', function (e) {
        mousePressed = true;
        draw(e.pageX - e.target.offsetLeft, e.pageY - e.target.offsetTop, false);
    });

    document.getElementById('c').addEventListener('mousemove', function (e) {
        if (mousePressed) {
            draw(e.pageX - e.target.offsetLeft, e.pageY - e.target.offsetTop, true);
        }
    });

    document.getElementById('c').addEventListener('mouseup', function (e) {
        mousePressed = false;
    });

    // Add touch event listeners to canvas element
    document.getElementById('c').addEventListener('touchstart', function (e) {
        mousePressed = true;
        draw(e.touches[0].pageX - e.target.offsetLeft, e.touches[0].pageY - e.target.offsetTop, false);
    });

    document.getElementById('c').addEventListener('touchmove', function (e) {
        if (mousePressed) {
            draw(e.touches[0].pageX - e.target.offsetLeft, e.touches[0].pageY - e.target.offsetTop, true);
        }
    });

    document.getElementById('c').addEventListener('touchend', function (e) {
        mousePressed = false;
    });

    document.getElementById('c').addEventListener('touchcancel', function (e) {
        mousePressed = false;
    });


    
}

function draw(x, y, isDown) {
    if (isDown) {
        ctx.beginPath();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 10;
        ctx.lineJoin = "round";
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.closePath();
        ctx.stroke();
    }
    lastX = x; lastY = y;
}

init();

document.addEventListener('DOMContentLoaded', run);