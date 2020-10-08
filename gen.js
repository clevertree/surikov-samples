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
                processDrums(file);

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

function processDrums(file) {
    let fileSplit = file
        .replace('sf2_file', '').replace('GM_', '')
        .split(/[_.]+/g);
    fileSplit.pop();
    fileSplit.shift();
    const instrumentID = '128' + fileSplit.shift();
    const libraryName = fileSplit.shift();
    const drumName = fileSplit.join(' ').trim();
    // console.log("TODO: Drums - ", file, drumName);
    const htmlString = fs.readFileSync(__dirname + '/src/' + file, 'utf8');
    const dom = new JSDOM(htmlString);
    const document = dom.window.document;
    const jsScripts = document.querySelectorAll('head > script[src]');



    const preset = getPreset(libraryName, drumName, 'Polyphony');
    const [className, presetConfig] = preset;
    presetConfig.title = drumName;
    // presetConfig.uuid = instrumentString;
    presetConfig.voices = [];

    // let i=0;
    for(const jsScript of jsScripts) {
        if(jsScript.src.startsWith('http'))
            continue;
        const jsScriptFile = jsScript.src;
        const drumID = parseInt(jsScriptFile.split('_').shift().substr(3, 2));
        // const drumName = drumNames[drumID] || "Unknown Drum";
        let jsString = fs.readFileSync(__dirname + '/src/' + jsScriptFile, 'utf8');
        const startPos = jsString.indexOf(`{\n\t`);
        if(startPos === -1)
            throw new Error("Instrument data start position was not found: " + file);

        jsString = `(function() {return ${jsString.substr(startPos)}}())`;
        const result = eval(jsString);

        for(const zone of result.zones) {
            processInstrumentZone(libraryName, instrumentID, presetConfig, zone, drumID);
        }
    }
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
    if(zone.loopStart > 0)
        voiceConfig.loopStart = zone.loopStart;
    if(zone.loopEnd > 0)
        voiceConfig.loopEnd = zone.loopEnd;
    const fineTune = 100.0 * (zone.coarseTune||0) - (zone.fineTune||0);
    if(fineTune !== 0)
        voiceConfig.fineTune = fineTune;
    if(zone.ahdsr)
        voiceConfig.ahdsr = "***REPLACE_AHDSR_REPLACE***"; // ['Envelope', {release: 100}];
    presetConfig.voices.push(['AudioBuffer', voiceConfig]);
    // presetConfig.midiID = zone.midi;



    // const sampleFile = path.resolve(sampleDirectory, sampleID + '.wav');

    voiceConfig.url = processBufferFromZone(libraryName, zone, instrumentID, sampleID)

}

const sampleHashes = {};

function processBufferFromZone(libraryName, zone, instrumentID, sampleID) {
    let sampleFile = `./${instrumentID}/${sampleID}.wav`;
    const absoluteFilePath = path.resolve(__dirname, 'build', libraryName, sampleFile);
    const absoluteDirectory = path.resolve(absoluteFilePath, '..');


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
            console.log("Re-using matching sample: ", libraryName, sampleFile, '==>', sampleHashes[hash]);
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
        fs.mkdirSync(absoluteDirectory, { recursive: true });
        SharedUtils.write_32_bit_float_buffer_to_16_bit_wav_file(source_obj, absoluteFilePath);
        sampleHashes[hash] = sampleFile;
        console.log("Writing Sample: ", libraryName, sampleFile);
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
            console.log("Re-using matching file: ", libraryName, sampleFile, '==>', sampleHashes[hash]);
            return sampleHashes[hash];
        }

        fs.mkdirSync(absoluteDirectory, { recursive: true });
        fs.writeFileSync(absoluteFilePath, Buffer.from(arraybuffer));
        sampleHashes[hash] = sampleFile;
        console.log("Writing Sample: ", libraryName, sampleFile);
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
    [/\t}\n\t\t+\]/g, "}]"],
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
        // midiID: null,
        voices: [],
    }]
    library.presets.push(preset);
    return preset;
}

function writeLibraries() {
    Object.keys(libraries).forEach(libraryName => {
        let libraryString = JSON.stringify(libraries[libraryName], null, '\t');
        libraryString = formatJSONLibrary(libraryString);
        const path = `${__dirname}/build/${libraryName}/${libraryName}.library.json`;
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


var drumNames = [];
drumNames[35] = "Bass Drum 2";
drumNames[36] = "Bass Drum 1";
drumNames[37] = "Side Stick/Rimshot";
drumNames[38] = "Snare Drum 1";
drumNames[39] = "Hand Clap";
drumNames[40] = "Snare Drum 2";
drumNames[41] = "Low Tom 2";
drumNames[42] = "Closed Hi-hat";
drumNames[43] = "Low Tom 1";
drumNames[44] = "Pedal Hi-hat";
drumNames[45] = "Mid Tom 2";
drumNames[46] = "Open Hi-hat";
drumNames[47] = "Mid Tom 1";
drumNames[48] = "High Tom 2";
drumNames[49] = "Crash Cymbal 1";
drumNames[50] = "High Tom 1";
drumNames[51] = "Ride Cymbal 1";
drumNames[52] = "Chinese Cymbal";
drumNames[53] = "Ride Bell";
drumNames[54] = "Tambourine";
drumNames[55] = "Splash Cymbal";
drumNames[56] = "Cowbell";
drumNames[57] = "Crash Cymbal 2";
drumNames[58] = "Vibra Slap";
drumNames[59] = "Ride Cymbal 2";
drumNames[60] = "High Bongo";
drumNames[61] = "Low Bongo";
drumNames[62] = "Mute High Conga";
drumNames[63] = "Open High Conga";
drumNames[64] = "Low Conga";
drumNames[65] = "High Timbale";
drumNames[66] = "Low Timbale";
drumNames[67] = "High Agogo";
drumNames[68] = "Low Agogo";
drumNames[69] = "Cabasa";
drumNames[70] = "Maracas";
drumNames[71] = "Short Whistle";
drumNames[72] = "Long Whistle";
drumNames[73] = "Short Guiro";
drumNames[74] = "Long Guiro";
drumNames[75] = "Claves";
drumNames[76] = "High Wood Block";
drumNames[77] = "Low Wood Block";
drumNames[78] = "Mute Cuica";
drumNames[79] = "Open Cuica";
drumNames[80] = "Mute Triangle";
drumNames[81] = "Open Triangle";



start();



