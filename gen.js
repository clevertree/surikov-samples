import fs from 'fs';
import path from 'path';
import atob from 'atob';

import CryptoJS from 'crypto-js';
import SharedUtils from 'shared-utils';
// import {FileWriter} from 'wav';
import {JSDOM} from 'jsdom';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

function start() {
// const { JSDOM } = require('jsdom');

    const ignoreFiles = ['index.html', 'WebAudioFontPlayer.js'];
    const filesHTML = fs.readdirSync(__dirname + '/src/')
        .filter(file => ignoreFiles.indexOf(file) === -1);
    const stats = {
        total: filesHTML.length,
        count: 0,
        error: 0
    }


    for (const file of filesHTML) {
        const fileUC = file.toLowerCase();
        try {
            if (fileUC.endsWith('sf2_file.html') || fileUC.endsWith('sf2.html')) {
                // Instruments
                processInstrument(file);


            } else if (fileUC.endsWith('sf2_file.js') || fileUC.endsWith('sf2.js')) {
                // Instrument Data

            } else if (fileUC.startsWith('drums_')) {
                // Drums
            } else {
                throw new Error("Unrecognized file: " + file);
            }
            stats.count++;
        } catch (e) {
            stats.error++;
            console.error(e);
        }
        // console.log(contents);
    }
    writeLibraries();

    console.log('stats', stats);

}

function processInstrument(file) {
    const [instrumentID, libraryName] = file.split('_');

    const htmlString = fs.readFileSync(__dirname + '/src/' + file, 'utf8');
    const dom = new JSDOM(htmlString);
    const document = dom.window.document;
    const firstPg = document.querySelector('body > p:first-child');
    if (!firstPg)
        throw new Error("No first paragraph string in HTML file: " + file);

    const jsScript = document.querySelectorAll('head > script[src]')[1];
    if (!jsScript)
        throw new Error("No 2nd script HTML file: " + file);
    const jsFile = jsScript.src;

    let instrumentString = firstPg.innerHTML
        .split("\t\tMIDI:")[1];
    if (!instrumentString)
        throw new Error("No instrument string in HTML file: " + file);
    instrumentString = instrumentString.trim();

    let jsString = fs.readFileSync(__dirname + '/src/' + jsFile, 'utf8');
    const startPos = jsString.indexOf(`{\n\t`);
    if(startPos === -1)
        throw new Error("Instrument data start position was not found: " + file);

    jsString = `(function() {return ${jsString.substr(startPos)}}())`;
    const result = eval(jsString);
    // console.log('instrumentString', instrumentString, libraryName, "Zones=" + result.zones.length);

    const preset = getPreset(libraryName, instrumentString, 'Polyphony');
    const [className, presetConfig] = preset;
    presetConfig.title = instrumentString;
    // presetConfig.uuid = instrumentString;
    presetConfig.voices = [];

    let i=0;
    for(const zone of result.zones) {
        processInstrumentZone(libraryName, instrumentID, presetConfig, zone, i++);
    }
}

function processInstrumentZone(libraryName, instrumentID, presetConfig, zone, sampleID) {
    const voiceConfig = {
        // "url": "./ffvi/atma_lead.wav",
        // "ahdsr": [0, 0, 0, 0, 100]
    };
    if(typeof zone.originalPitch !== "undefined")
        voiceConfig.keyRoot = getCommandFromMIDINote(zone.originalPitch/100);
    if(typeof zone.keyRangeLow !== "undefined")
        voiceConfig.keyRangeLow = getCommandFromMIDINote(zone.keyRangeLow);
    if(typeof zone.keyRangeHigh !== "undefined")
        voiceConfig.keyRangeHigh = getCommandFromMIDINote(zone.keyRangeHigh);
    if(typeof zone.loopStart !== "undefined")
        voiceConfig.loopStart = zone.loopStart;
    if(typeof zone.loopEnd !== "undefined")
        voiceConfig.loopEnd = zone.loopEnd;
    const fineTune = 100.0 * (zone.coarseTune||0) - (zone.fineTune||0);
    if(fineTune !== 0)
        voiceConfig.fineTune = fineTune;
    if(zone.ahdsr)
        voiceConfig.ahdsr = "***REPLACE_AHDSR_REPLACE***"; // ['Envelope', {release: 100}];
    presetConfig.voices.push(['AudioBuffer', voiceConfig]);
    presetConfig.midiID = zone.midi;


    const sampleDirectory = path.resolve(__dirname,'build', libraryName, instrumentID);
    fs.mkdirSync(sampleDirectory, { recursive: true });

    // const sampleFile = path.resolve(sampleDirectory, sampleID + '.wav');
    let sampleFile = `./${libraryName}/${instrumentID}/${sampleID}.wav`;

    sampleFile = processBufferFromZone(zone, sampleFile)
    voiceConfig.url = sampleFile;
    /**
     midi:75
     ,originalPitch:8100
     ,keyRangeLow:0
     ,keyRangeHigh:111
     ,loopStart:18710
     ,loopEnd:32333
     ,coarseTune:0
     ,fineTune:10
     ,sampleRate:30000
     ,ahdsr:false
     ,file:'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'
     ,anchor:0.87003332
     */
}

const sampleHashes = {};

function processBufferFromZone(zone, sampleFile) {
    const absoluteFilePath = path.resolve(__dirname, 'build', sampleFile);
    if (zone.sample) {
        // const arraybuffer = atob(zone.sample);


        var decoded = atob(zone.sample);
        // zone.buffer = audioContext.createBuffer(1, decoded.length / 2, zone.sampleRate);
        var float32Array = new Float32Array(decoded.length / 2);
        var b1,
            b2,
            n;
        for (var i = 0; i < decoded.length / 2; i++) {
            b1 = decoded.charCodeAt(i * 2);
            b2 = decoded.charCodeAt(i * 2 + 1);
            if (b1 < 0) {
                b1 = 256 + b1;
            }
            if (b2 < 0) {
                b2 = 256 + b2;
            }
            n = b2 * 256 + b1;
            if (n >= 65536 / 2) {
                n = n - 65536;
            }
            float32Array[i] = n / 65536.0;
        }

        const hash = 's' + CryptoJS.SHA256(float32Array.toString()).toString();
        // console.log('hash', hash);
        if(sampleHashes[hash]) {
            console.log("Re-using matching sample: ", sampleFile, '==>', sampleHashes[hash]);
            return sampleHashes[hash];
        }

        // var output_dir = process.argv[2] || "/tmp";
        // var output_format = ".wav";
        // var source_wave = "source_wave_shared_utils_test";
        // var source_wave_filename = path.join(output_dir, source_wave + output_format);

        var source_obj = {
            sample_rate: zone.sampleRate,
            buffer: float32Array
        };
        SharedUtils.write_32_bit_float_buffer_to_16_bit_wav_file(source_obj, absoluteFilePath);
        sampleHashes[hash] = sampleFile;
        console.log("Writing Sample: ", sampleFile);
        return sampleFile;


    } else if (zone.file) {
        var datalen = zone.file.length;
        const arraybuffer = new ArrayBuffer(datalen);
        var view = new Uint8Array(arraybuffer);
        var decoded = atob(zone.file);
        var b;
        for (var i = 0; i < decoded.length; i++) {
            b = decoded.charCodeAt(i);
            view[i] = b;
        }


        const hash = 'f' + CryptoJS.SHA256(view.toString()).toString();
        // console.log('hash', hash);
        if(sampleHashes[hash]) {
            console.log("Re-using matching file: ", sampleFile, '==>', sampleHashes[hash]);
            return sampleHashes[hash];
        }


        fs.writeFileSync(absoluteFilePath, Buffer.from(arraybuffer));
        sampleHashes[hash] = sampleFile;
        console.log("Writing Sample: ", sampleFile);
        return sampleFile;
        // audioContext.decodeAudioData(arraybuffer, function (audioBuffer) {
        //     zone.buffer = audioBuffer;
        // });
    }
    // if(!arraybuffer)
    //     throw new Error("Could not process array buffer from zone");


    // return arraybuffer;
}

const replaceStrings = [
    [/\[\s+"AudioBuffer",\s+{/g, '[ "AudioBuffer", {'],
    [/\[\s+"Polyphony",\s+{/g, '[ "Polyphony", {'],
    [/\[\s+"Envelope",\s+{/g, '[ "Envelope", {'],
    [new RegExp(escapeRegex('"ahdsr": "***REPLACE_AHDSR_REPLACE***"'), 'g'), '"ahdsr": ["Envelope", {"release": 100}]'],
    // [/\t\t\t\t\t\t"/g, "\t\t\t\t\""],
    // [/\t\t\t\t\t"/g, "\t\t\t\""],
// "\t\t\t\t",
//     [/\t\t\t\t"/g, "\t\t\t\""],
    [/\t}\n\t\t\t\t\t\]/g, "}]"],
    [/\t\t\t\t/g, "\t\t\t"],
    [/\t\t\t\t\t/g, "\t\t\t\t"]
]
const libraries = {};

function getPreset(libraryName, presetTitle, presetClassName) {
    if(!libraries[libraryName]) {
        libraries[libraryName] = {
            title: libraryName,
            presets: []
        }
    }

    const library = libraries[libraryName];
    for(const preset of library.presets) {
        const [className, classConfig] = preset;
        if( className === presetClassName &&
            classConfig.title === presetTitle)
            return preset;
    }

    const preset = [presetClassName, {
        title: presetTitle,
        midiID: null,
        voices: [],
    }]
    library.presets.push(preset);
    return preset;
}

function writeLibraries() {
    Object.keys(libraries).forEach(libraryName => {
        let libraryString = JSON.stringify(libraries[libraryName], null, '\t');
        libraryString = formatJSONLibrary(libraryString);
        const path = __dirname + '/build/' + libraryName + '.library.json';
        console.log("Writing Library: ", path);
        fs.writeFileSync(path, libraryString, 'utf8');
    })
}


function formatJSONLibrary(jsonString) {
    for(const replaceString of replaceStrings) {
        const [searchValue, replaceValue] = replaceString;
        jsonString = jsonString.replace(searchValue, replaceValue)
    }
    return jsonString;
}

function escapeRegex(str) {
    return str.replace(/([.*+?^=!:${}()|[\]/\\])/g, "\\$1");
}









const midiNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function getCommandFromMIDINote(midiNote) {
    const octave = Math.floor(midiNote / 12);
    const pitch = midiNote % 12;
    return midiNotes[pitch] + octave;
}





start();



