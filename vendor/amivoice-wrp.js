/* AmiVoice API 公式 JavaScript クライアントライブラリ（advanced-media-inc/amivoice-api-client-library, Wrp 版 1.0.12）を無改変で収録 */
var Result = function () {
	var result_ = {
		version: "Result/1.0.12",
		parse: parse_,
		parseJSON: parseJSON_,
		parseTEXT: parseTEXT_,
		parseRAW: parseRAW_
	};

	function parse_(result) {
		try {
			return parseJSON_(result);
		} catch (e) {
			if (result.indexOf("\x01") == -1) {
				return parseTEXT_(result);
			} else {
				return parseRAW_(result);
			}
		}
	}

	function parseJSON_(result) {
		var json = JSON.parse(result);
		json.duration = (json.results && json.results[0]) ? json.results[0].endtime : 0;
		json.confidence = (json.results && json.results[0]) ? json.results[0].confidence : -1.0;
		return json;
	}

	function parseTEXT_(result) {
		return {
			text: result,
			duration: 0,
			confidence: -1.0,
			code: "",
			message: ""
		};
	}

	function parseRAW_(result) {
		var local = {
			buffer: "",
			bufferEnding: 0
		};
		var fields = result.split("\x01");
		var fields0 = fields[0].split("|");
		var i, j;
		for (i = 0; i < fields0.length; i++) {
			var written = fields0[i];
			if ((j = written.indexOf(" ")) != -1) {
				written = written.slice(0, j);
			}
			if ((j = written.indexOf(":")) != -1) {
				written = written.slice(0, j);
			}
			if ((j = written.indexOf("\x03")) != -1) {
				written = written.slice(0, j);
			}
			append_(local, written);
		}
		return {
			text: local.buffer,
			duration: (fields[2]) ? parseInt(fields[2].split("-")[1]) : 0,
			confidence: (fields[1]) ? parseFloat(fields[1]) : -1.0,
			code: "",
			message: ""
		};
	}

	function append_(local, item) {
		if (item.length == 0) {
			return;
		}
		if (item == "<->") {
			return;
		}
		var itemState = 0;
		for (var i = 0; i < item.length; i++) {
			var c = item.charCodeAt(i);
			if (itemState == 0) {
				if (c == 0x005F) {
					break;
				} else
				if (c == 0x4E00 || c == 0x4E8C || c == 0x4E09 || c == 0x56DB || c == 0x4E94 || c == 0x516D || c == 0x4E03 || c == 0x516B || c == 0x4E5D) { // '一'～'九'
					itemState = 1;
				} else
				if (c == 0x5341) { // '十'
					itemState = 2;
				} else
				if (c == 0x767E) { // '百'
					itemState = 4;
				} else
				if (c == 0x5343) { // '千'
					itemState = 8;
				} else {
					break;
				}
			} else {
				if (c == 0x005F) {
					item = item.substr(0, i) + item.substr(i + 1);
					break;
				} else
				if (c == 0x4E00 || c == 0x4E8C || c == 0x4E09 || c == 0x56DB || c == 0x4E94 || c == 0x516D || c == 0x4E03 || c == 0x516B || c == 0x4E5D) { // '一'～'九'
					if ((itemState & 1) != 0) {
						break;
					} else {
						itemState |= 1;
					}
				} else
				if (c == 0x5341) { // '十'
					if ((itemState & 2) != 0) {
						break;
					} else {
						itemState |= 2;
						itemState &= ~1;
					}
				} else
				if (c == 0x767E) { // '百'
					if ((itemState & 6) != 0) {
						break;
					} else {
						itemState |= 4;
						itemState &= ~1;
					}
				} else
				if (c == 0x5343) { // '千'
					if ((itemState & 14) != 0) {
						break;
					} else {
						itemState |= 8;
						itemState &= ~1;
					}
				} else {
					break;
				}
			}
		}
		item = item.replace(/_/g, " ");
		var itemBeginningChar = item.charCodeAt(0);
		var itemEndingChar = (item.length > 1) ? item.charCodeAt(item.length - 1) : 0;
		if (local.bufferEnding == 0) {
			var itemBeginning;
			var c = itemBeginningChar;
			if (c == 0x0020) {
				itemBeginning = 0;
			} else
			if (c == 0x0021
			 || c == 0x002C
			 || c == 0x002E
			 || c == 0x003A
			 || c == 0x003B
			 || c == 0x003F) {
				itemBeginning = 5;
			} else
			if (c == 0x3001
			 || c == 0x3002
			 || c == 0xFF01
			 || c == 0xFF0C
			 || c == 0xFF0E
			 || c == 0xFF1A
			 || c == 0xFF1B
			 || c == 0xFF1F) {
				itemBeginning = 6;
			} else {
				itemBeginning = 7;
			}
			if (itemBeginning == 0
			 || itemBeginning == 5
			 || itemBeginning == 6) {
				if (local.buffer.length > 0) {
					local.buffer = local.buffer.substr(0, local.buffer.length - 1);
				}
			}
		} else {
			var itemBeginning;
			var c = itemBeginningChar;
			if (c == 0x0020) {
				itemBeginning = 0;
			} else
			if (c >= 0x0041 && c <= 0x005A
			 || c >= 0x0061 && c <= 0x007A
			 || c >= 0x0100 && c <= 0x0DFF
			 || c >= 0x0E60 && c <= 0x01FF) {
				itemBeginning = 1;
			} else
			if (c >= 0xFF21 && c <= 0xFF3A
			 || c >= 0xFF41 && c <= 0xFF5A) {
				itemBeginning = 2;
			} else
			if (c >= 0x0030 && c <= 0x0039) {
				itemBeginning = (local.bufferEnding == 8 && itemEndingChar == 0) ? 8 : 3;
			} else
			if (c >= 0xFF10 && c <= 0xFF19) {
				itemBeginning = (local.bufferEnding == 9 && itemEndingChar == 0) ? 9 : 4;
			} else
			if (c == 0x0021
			 || c == 0x002C
			 || c == 0x002E
			 || c == 0x003A
			 || c == 0x003B
			 || c == 0x003F) {
				itemBeginning = 5;
			} else
			if (c == 0x3001
			 || c == 0x3002
			 || c == 0xFF01
			 || c == 0xFF0C
			 || c == 0xFF0E
			 || c == 0xFF1A
			 || c == 0xFF1B
			 || c == 0xFF1F) {
				itemBeginning = 6;
			} else {
				itemBeginning = 7;
			}
			if (itemBeginning == 1 || local.bufferEnding == 1 && (itemBeginning == 2
																									 || itemBeginning == 3
																									 || itemBeginning == 4
																									 || itemBeginning == 7)
														 || local.bufferEnding == 2 && (itemBeginning == 2)
														 || local.bufferEnding == 3 && (itemBeginning == 3
																									 || itemBeginning == 4)
														 || local.bufferEnding == 4 && (itemBeginning == 3
																									 || itemBeginning == 4)
														 || local.bufferEnding == 5 && (itemBeginning == 2
																									 || itemBeginning == 3
																									 || itemBeginning == 4
																									 || itemBeginning == 7)
														 || local.bufferEnding == 8 && (itemBeginning == 3
																									 || itemBeginning == 4)
														 || local.bufferEnding == 9 && (itemBeginning == 3
																									 || itemBeginning == 4)) {
				local.buffer += " ";
			}
		}
		local.buffer += item;
		c = (itemEndingChar == 0) ? itemBeginningChar : itemEndingChar;
		if (c == 0x0020) {
			local.bufferEnding = 0;
		} else
		if (c >= 0x0041 && c <= 0x005A
		 || c >= 0x0061 && c <= 0x007A
		 || c >= 0x0100 && c <= 0x0DFF
		 || c >= 0x0E60 && c <= 0x01FF) {
			local.bufferEnding = 1;
		} else
		if (c >= 0xFF21 && c <= 0xFF3A
		 || c >= 0xFF41 && c <= 0xFF5A) {
			local.bufferEnding = 2;
		} else
		if (c >= 0x0030 && c <= 0x0039) {
			local.bufferEnding = (itemEndingChar == 0) ? 8 : 3;
		} else
		if (c >= 0xFF10 && c <= 0xFF19) {
			local.bufferEnding = (itemEndingChar == 0) ? 9 : 4;
		} else
		if (c == 0x0021
		 || c == 0x002C
		 || c == 0x002E
		 || c == 0x003A
		 || c == 0x003B
		 || c == 0x003F) {
			local.bufferEnding = 5;
		} else
		if (c == 0x3001
		 || c == 0x3002
		 || c == 0xFF01
		 || c == 0xFF0C
		 || c == 0xFF0E
		 || c == 0xFF1A
		 || c == 0xFF1B
		 || c == 0xFF1F) {
			local.bufferEnding = 6;
		} else {
			local.bufferEnding = 7;
		}
	}

	return result_;
}();

var Recorder = function () {
	// window.AudioContext()
	window.AudioContext = window.AudioContext || window.webkitAudioContext || window.mozAudioContext || window.msAudioContext;
	// navigator.getUserMedia()
	navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
	// navigator.mediaDevices.getUserMedia()
	navigator.mediaDevices = navigator.mediaDevices || ((navigator.getUserMedia) ? {
		getUserMedia: function (c) {
			return new Promise(
				function (y, n) {
					navigator.getUserMedia(c, y, n);
				}
			);
		}
	} : null);

	// public オブジェクト
	var recorder_ = {
		// public プロパティ
		version: "Recorder/1.0.12",
		recordingSource: 1,
		recordingSourceElement: undefined,
		sampleRate: 16000,
		sampleRateElement: undefined,
		maxRecordingTime: 60000,
		maxRecordingTimeElement: undefined,
		downSampling: false,
		downSamplingElement: undefined,
		adpcmPacking: false,
		adpcmPackingElement: undefined,
		opusPacking: false,
		opusPackingElement: undefined,
		// public メソッド
		resume: resume_,
		pause: pause_,
		isActive: isActive_,
		getConverter: getConverter_,
		// イベントハンドラ
		resumeStarted: undefined,
		resumeEnded: undefined,
		recorded: undefined,
		pauseStarted: undefined,
		pauseEnded: undefined,
		TRACE: undefined
	};

	// 録音関連
	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
	//  ┌────┐
	//  │0       │←───────────────────────┐┐┐
	//  └┬───┘                                                │││
	//    │resume()                                                │││
	//    │ - getUserMedia()                                       │││
	//    │                                                        │││
	//    ↓resumeStarted                                           │││
	//  ┌────┐                                                │││
	//  │1       │                                                │││
	//  └┬┬┬─┘                                                │││
	//    │││getUserMedia() 失敗                                 │││
	//    │││                                                    │││
	//    │││pauseEnded                                          │││
	//    ││└──────────────────────────┘││
	//    ││                                                        ││
	//    ││getUserMedia() 成功 && state_==3                        ││
	//    ││ - audioStream.getTracks().forEach(track=>track.stop()) ││
	//    ││                                                        ││
	//    ││pauseEnded                                              ││
	//    │└────────────────────────────┘│
	//    │                                                            │
	//    │getUserMedia() 成功 && state_==1                            │
	//    │ - audioProvider_=audioContext_.createMediaStreamSource     │
	//    │                                             (audioStream_) │
	//    │ - audioProvider_.connect(audioProcessor_)                  │
	//    │ - audioProcessor_.connect(audioContext_.destination)       │
	//    │                                                            │
	//    ↓resumeEnded                                                 │
	//  ┌────┐                                                    │
	//  │2 録音中│←────────────────────────┐│
	//  └┬┬──┘                                                  ││
	//    ││audioProcessor_.onaudioprocess                          ││
	//    │└────────────────────────────┘│
	//    │                                                            │
	//    │pause()                                                     │
	//    │                                                            │
	//    ↓pauseStarted                                                │
	//  ┌────┐                                                    │
	//  │3       │                                                    │
	//  └┬───┘                                                    │
	//    │audioProcessor_.onaudioprocess                              │
	//    │ - audioStream_.getTracks().forEach(track=>track.stop())    │
	//    │ - audioProvider_.disconnect()                              │
	//    │ - audioProcessor_.disconnect()                             │
	//    ↓                                                            │
	//  ┌────┐                                                    │
	//  │4       │                                                    │
	//  └┬───┘                                                    │
	//    │pauseEnded                                                  │
	//    └──────────────────────────────┘
	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
	var state_ = -1;
	var audioContext_;
	var audioProcessor_;
	var audioProcessor_onaudioprocess_;
	var audioProcessor_onaudioprocess_recorded_;
	var audioProcessor_onaudioprocess_downSampling_;
	var audioProcessor_onaudioprocess_downSampling_recorded_;
	var audioStream_;
	var audioProvider_;
	var audioSamplesPerSec_;
	var audioDecimationFactor_;
	var temporaryAudioData_;
	var temporaryAudioDataSamples_;
	var coefData_;
	var pcmData_;
	var waveData_;
	var waveFile_;
	var encoder_;
	var converter_;
	var reason_;
	var maxRecordingTimeTimerId_;

	// 各種変数の初期化
	async function initialize_() {
		// 録音関係の各種変数の初期化
		audioContext_ = new AudioContext({sampleRate: recorder_.sampleRate});
		recorder_.sampleRate = audioContext_.sampleRate; // public プロパティを通して外部から参照可能にしておく...
		await audioContext_.audioWorklet.addModule(URL.createObjectURL(new Blob([
			"registerProcessor('audioWorkletProcessor', class extends AudioWorkletProcessor {",
			"  constructor() {",
			"    super()",
			"  }",
			"  process(inputs, outputs, parameters) {",
			"    if (inputs.length > 0 && inputs[0].length > 0) {",
			"      if (inputs[0].length === 2) {",
			"        for (var j = 0; j < inputs[0][0].length; j++) {",
			"          inputs[0][0][j] = (inputs[0][0][j] + inputs[0][1][j]) / 2",
			"        }",
			"      }",
			"      this.port.postMessage(inputs[0][0], [inputs[0][0].buffer])",
			"    }",
			"    return true",
			"  }",
			"})"
		], {type: 'application/javascript'})));
		audioProcessor_ = new AudioWorkletNode(audioContext_, 'audioWorkletProcessor');
		audioProcessor_.bufferSize = 128;
		audioProcessor_onaudioprocess_ = function (event) {
			// <!-- for AudioWorklet
			if (state_ === 0) {
				return;
			}
			// -->
			var audioData = event.data;
			var pcmDataBytes = audioData.length * 2;
			var pcmData = new Uint8Array(new ArrayBuffer(16 + pcmDataBytes), 16, pcmDataBytes);
			var pcmDataIndex = 0;
			for (var audioDataIndex = 0; audioDataIndex < audioData.length; audioDataIndex++) {
				var pcm = audioData[audioDataIndex] * 32768 | 0; // 小数 (0.0～1.0) を 整数 (-32768～32767) に変換...
				if (pcm > 32767) {
					pcm = 32767;
				} else
				if (pcm < -32768) {
					pcm = -32768;
				}
				pcmData[pcmDataIndex++] = (pcm     ) & 0xFF;
				pcmData[pcmDataIndex++] = (pcm >> 8) & 0xFF;
			}
			if (!encoder_) {
				waveData_.push(pcmData);
			} else {
				pcmData = encoder_.encode(pcmData);
				if (pcmData) {
					waveData_.push(pcmData);
				}
			}
			if (state_ === 3) {
				state_ = 4;
				audioStream_.stopTracks();
				audioStream_ = undefined;
				audioProvider_.disconnect();
				audioProvider_ = undefined;
				audioProcessor_.disconnect();
				if (recorder_.TRACE) recorder_.TRACE("INFO: stopped recording");
			}
		};
		audioProcessor_onaudioprocess_recorded_ = function (event) {
			// <!-- for AudioWorklet
			if (state_ === 0) {
				return;
			}
			// -->
			var audioData = event.data;
			var pcmDataOffset = (encoder_) ? 1 + 16 : 1;
			var pcmDataIndex = pcmDataOffset;
			for (var audioDataIndex = 0; audioDataIndex < audioData.length; audioDataIndex++) {
				var pcm = audioData[audioDataIndex] * 32768 | 0; // 小数 (0.0～1.0) を 整数 (-32768～32767) に変換...
				if (pcm > 32767) {
					pcm = 32767;
				} else
				if (pcm < -32768) {
					pcm = -32768;
				}
				pcmData_[pcmDataIndex++] = (pcm     ) & 0xFF;
				pcmData_[pcmDataIndex++] = (pcm >> 8) & 0xFF;
			}
			var pcmData = pcmData_.subarray(pcmDataOffset, pcmDataIndex);
			if (!encoder_) {
				recorder_.recorded(pcmData);
			} else {
				pcmData = encoder_.encode(pcmData);
				if (pcmData) {
					recorder_.recorded(pcmData);
				}
			}
			if (state_ === 3) {
				state_ = 4;
				audioStream_.stopTracks();
				audioStream_ = undefined;
				audioProvider_.disconnect();
				audioProvider_ = undefined;
				audioProcessor_.disconnect();
				if (recorder_.TRACE) recorder_.TRACE("INFO: stopped recording");
			}
		};
		audioProcessor_onaudioprocess_downSampling_ = function (event) {
			// <!-- for Safari and AudioWorklet
			if (state_ === 0) {
				return;
			}
			// -->
			var audioData = event.data;
			var audioDataIndex = 0;
			while (temporaryAudioDataSamples_ < temporaryAudioData_.length) {
				temporaryAudioData_[temporaryAudioDataSamples_++] = audioData[audioDataIndex++];
			}
			while (temporaryAudioDataSamples_ == temporaryAudioData_.length) {
				var pcmDataBytes = (audioData.length / audioDecimationFactor_ | 0) * 2;
				var pcmData = new Uint8Array(new ArrayBuffer(16 + pcmDataBytes), 16, pcmDataBytes);
				var pcmDataIndex = 0;
				for (var temporaryAudioDataIndex = audioDecimationFactor_ - 1; temporaryAudioDataIndex + 20 < temporaryAudioData_.length; temporaryAudioDataIndex += audioDecimationFactor_) {
					var pcm_float = 0.0;
					for (var i = 0; i <= 20; i++) {
						pcm_float += temporaryAudioData_[temporaryAudioDataIndex + i] * coefData_[i];
					}
					var pcm = pcm_float * 32768 | 0; // 小数 (0.0～1.0) を 整数 (-32768～32767) に変換...
					if (pcm > 32767) {
						pcm = 32767;
					} else
					if (pcm < -32768) {
						pcm = -32768;
					}
					pcmData[pcmDataIndex++] = (pcm     ) & 0xFF;
					pcmData[pcmDataIndex++] = (pcm >> 8) & 0xFF;
				}
				if (!encoder_) {
					waveData_.push(pcmData);
				} else {
					pcmData = encoder_.encode(pcmData);
					if (pcmData) {
						waveData_.push(pcmData);
					}
				}
				temporaryAudioDataSamples_ = 0;
				var temporaryAudioDataIndex = temporaryAudioData_.length - 20;
				while (temporaryAudioDataIndex < temporaryAudioData_.length) {
					temporaryAudioData_[temporaryAudioDataSamples_++] = temporaryAudioData_[temporaryAudioDataIndex++];
				}
				while (audioDataIndex < audioData.length) {
					temporaryAudioData_[temporaryAudioDataSamples_++] = audioData[audioDataIndex++];
				}
			}
			if (state_ === 3) {
				state_ = 4;
				audioStream_.stopTracks();
				audioStream_ = undefined;
				audioProvider_.disconnect();
				audioProvider_ = undefined;
				audioProcessor_.disconnect();
				if (recorder_.TRACE) recorder_.TRACE("INFO: stopped recording");
			}
		};
		audioProcessor_onaudioprocess_downSampling_recorded_ = function (event) {
			// <!-- for Safari and AudioWorklet
			if (state_ === 0) {
				return;
			}
			// -->
			var audioData = event.data;
			var audioDataIndex = 0;
			while (temporaryAudioDataSamples_ < temporaryAudioData_.length) {
				temporaryAudioData_[temporaryAudioDataSamples_++] = audioData[audioDataIndex++];
			}
			while (temporaryAudioDataSamples_ == temporaryAudioData_.length) {
				var pcmDataOffset = (encoder_) ? 1 + 16 : 1;
				var pcmDataIndex = pcmDataOffset;
				for (var temporaryAudioDataIndex = audioDecimationFactor_ - 1; temporaryAudioDataIndex + 20 < temporaryAudioData_.length; temporaryAudioDataIndex += audioDecimationFactor_) {
					var pcm_float = 0.0;
					for (var i = 0; i <= 20; i++) {
						pcm_float += temporaryAudioData_[temporaryAudioDataIndex + i] * coefData_[i];
					}
					var pcm = pcm_float * 32768 | 0; // 小数 (0.0～1.0) を 整数 (-32768～32767) に変換...
					if (pcm > 32767) {
						pcm = 32767;
					} else
					if (pcm < -32768) {
						pcm = -32768;
					}
					pcmData_[pcmDataIndex++] = (pcm     ) & 0xFF;
					pcmData_[pcmDataIndex++] = (pcm >> 8) & 0xFF;
				}
				var pcmData = pcmData_.subarray(pcmDataOffset, pcmDataIndex);
				if (!encoder_) {
					recorder_.recorded(pcmData);
				} else {
					pcmData = encoder_.encode(pcmData);
					if (pcmData) {
						recorder_.recorded(pcmData);
					}
				}
				temporaryAudioDataSamples_ = 0;
				var temporaryAudioDataIndex = temporaryAudioData_.length - 20;
				while (temporaryAudioDataIndex < temporaryAudioData_.length) {
					temporaryAudioData_[temporaryAudioDataSamples_++] = temporaryAudioData_[temporaryAudioDataIndex++];
				}
				while (audioDataIndex < audioData.length) {
					temporaryAudioData_[temporaryAudioDataSamples_++] = audioData[audioDataIndex++];
				}
			}
			if (state_ === 3) {
				state_ = 4;
				audioStream_.stopTracks();
				audioStream_ = undefined;
				audioProvider_.disconnect();
				audioProvider_ = undefined;
				audioProcessor_.disconnect();
				if (recorder_.TRACE) recorder_.TRACE("INFO: stopped recording");
			}
		};
		if (audioContext_.sampleRate === 48000) {
			audioSamplesPerSec_ = 16000;
			audioDecimationFactor_ = 3;
		} else
		if (audioContext_.sampleRate === 44100) {
			audioSamplesPerSec_ = 22050;
			audioDecimationFactor_ = 2;
		} else
		if (audioContext_.sampleRate === 22050) {
			audioSamplesPerSec_ = 22050;
			audioDecimationFactor_ = 1;
		} else
		if (audioContext_.sampleRate === 16000) {
			audioSamplesPerSec_ = 16000;
			audioDecimationFactor_ = 1;
		} else
		if (audioContext_.sampleRate === 8000) {
			audioSamplesPerSec_ = 8000;
			audioDecimationFactor_ = 1;
		} else {
			audioSamplesPerSec_ = 0;
			audioDecimationFactor_ = 0;
		}
		if (audioDecimationFactor_ > 1) {
			temporaryAudioData_ = new Float32Array(20 + ((audioProcessor_.bufferSize / audioDecimationFactor_ >> 1) << 1) * audioDecimationFactor_);
			temporaryAudioDataSamples_ = 0;
			coefData_ = new Float32Array(10 + 1 + 10);
			if (audioDecimationFactor_ == 3) {
				coefData_[ 0] = -1.9186907e-2;
				coefData_[ 1] =  1.2144312e-2;
				coefData_[ 2] =  3.8677038e-2;
				coefData_[ 3] =  3.1580867e-2;
				coefData_[ 4] = -1.2342449e-2;
				coefData_[ 5] = -6.0144741e-2;
				coefData_[ 6] = -6.1757100e-2;
				coefData_[ 7] =  1.2462522e-2;
				coefData_[ 8] =  1.4362448e-1;
				coefData_[ 9] =  2.6923548e-1;
				coefData_[10] =  3.2090380e-1;
				coefData_[11] =  2.6923548e-1;
				coefData_[12] =  1.4362448e-1;
				coefData_[13] =  1.2462522e-2;
				coefData_[14] = -6.1757100e-2;
				coefData_[15] = -6.0144741e-2;
				coefData_[16] = -1.2342449e-2;
				coefData_[17] =  3.1580867e-2;
				coefData_[18] =  3.8677038e-2;
				coefData_[19] =  1.2144312e-2;
				coefData_[20] = -1.9186907e-2;
			} else {
				coefData_[ 0] =  6.91278819431317970157e-6;
				coefData_[ 1] =  3.50501872599124908447e-2;
				coefData_[ 2] = -6.93948777552577666938e-6;
				coefData_[ 3] = -4.52254377305507659912e-2;
				coefData_[ 4] =  6.96016786605468951166e-6;
				coefData_[ 5] =  6.34850487112998962402e-2;
				coefData_[ 6] = -6.97495897838962264359e-6;
				coefData_[ 7] = -1.05997055768966674805e-1;
				coefData_[ 8] =  6.98394205755903385580e-6;
				coefData_[ 9] =  3.18274468183517456055e-1;
				coefData_[10] =  4.99993026256561279297e-1;
				coefData_[11] =  3.18274468183517456055e-1;
				coefData_[12] =  6.98394205755903385580e-6;
				coefData_[13] = -1.05997055768966674805e-1;
				coefData_[14] = -6.97495897838962264359e-6;
				coefData_[15] =  6.34850487112998962402e-2;
				coefData_[16] =  6.96016786605468951166e-6;
				coefData_[17] = -4.52254377305507659912e-2;
				coefData_[18] = -6.93948777552577666938e-6;
				coefData_[19] =  3.50501872599124908447e-2;
				coefData_[20] =  6.91278819431317970157e-6;
			}
		}
		pcmData_ = new Uint8Array(1 + 16 + audioProcessor_.bufferSize * 2);
		reason_ = {code: 0, message: ""};
		maxRecordingTimeTimerId_ = null;
	}

	// 録音の開始
	async function resume_() {
		if (state_ !== -1 && state_ !== 0) {
			if (recorder_.TRACE) recorder_.TRACE("ERROR: can't start recording (invalid state: " + state_ + ")");
			return false;
		}
		if (recorder_.resumeStarted) recorder_.resumeStarted();
		if (!window.AudioContext) {
			if (recorder_.TRACE) recorder_.TRACE("ERROR: can't start recording (Unsupported AudioContext class)");
			if (recorder_.pauseEnded) recorder_.pauseEnded({code: 2, message: "Unsupported AudioContext class"}, waveFile_);
			return true;
		}
		if (!navigator.mediaDevices) {
			if (recorder_.TRACE) recorder_.TRACE("ERROR: can't start recording (Unsupported MediaDevices class)");
			if (recorder_.pauseEnded) recorder_.pauseEnded({code: 2, message: "Unsupported MediaDevices class"}, waveFile_);
			return true;
		}
		if (recorder_.recordingSourceElement) recorder_.recordingSource = recorder_.recordingSourceElement.value - 0;
		if (recorder_.sampleRateElement) recorder_.sampleRate = recorder_.sampleRateElement.value - 0;
		if (recorder_.maxRecordingTimeElement) recorder_.maxRecordingTime = recorder_.maxRecordingTimeElement.value - 0;
		if (recorder_.downSamplingElement) recorder_.downSampling = recorder_.downSamplingElement.checked;
		if (recorder_.adpcmPackingElement) recorder_.adpcmPacking = recorder_.adpcmPackingElement.checked;
		if (recorder_.opusPackingElement) recorder_.opusPacking = recorder_.opusPackingElement.checked;
		if (state_ === 0) {
			audioStream_ = null;
			audioProvider_ = null;
			audioProcessor_ = null;
			audioContext_.close();
			audioContext_ = null;
			state_ = -1;
		}
		if (state_ === -1) {
			// 各種変数の初期化
			await initialize_();
			state_ = 0;
		}
		if (recorder_.downSampling) {
			if (audioContext_.sampleRate === 48000) {
				audioSamplesPerSec_ = 16000;
				audioDecimationFactor_ = 3;
			} else
			if (audioContext_.sampleRate === 44100) {
				audioSamplesPerSec_ = 22050;
				audioDecimationFactor_ = 2;
			} else
			if (audioContext_.sampleRate === 22050) {
				audioSamplesPerSec_ = 22050;
				audioDecimationFactor_ = 1;
			} else
			if (audioContext_.sampleRate === 16000) {
				audioSamplesPerSec_ = 16000;
				audioDecimationFactor_ = 1;
			} else
			if (audioContext_.sampleRate === 8000) {
				audioSamplesPerSec_ = 8000;
				audioDecimationFactor_ = 1;
			} else {
				audioSamplesPerSec_ = 0;
				audioDecimationFactor_ = 0;
			}
		} else {
			audioSamplesPerSec_ = audioContext_.sampleRate;
			audioDecimationFactor_ = 1;
		}
		if (audioSamplesPerSec_ === 0) {
			if (recorder_.TRACE) recorder_.TRACE("ERROR: can't start recording (Unsupported sample rate: " + audioContext_.sampleRate + "Hz)");
			reason_.code = 2;
			reason_.message = "Unsupported sample rate: " + audioContext_.sampleRate + "Hz";
			if (recorder_.pauseEnded) recorder_.pauseEnded(reason_, waveFile_);
			return true;
		}
		state_ = 1;
		if (audioDecimationFactor_ > 1) {
			for (var i = 0; i <= 20; i++) {
				temporaryAudioData_[i] = 0.0;
			}
			temporaryAudioDataSamples_ = 20;
		}
		// <!-- for ADPCM/Opus packing
		encoder_ = null;
		if (!encoder_ && recorder_.opusPacking && window.Encoder && window.Encoder.createOpusEncoder) {
			encoder_ = window.Encoder.createOpusEncoder(audioSamplesPerSec_, /* bitsPerSec */ 24000, /* vbr: VBR */ 1, /* application: AUDIO */ 1, /* complexity */ 10);
		}
		if (!encoder_ && recorder_.adpcmPacking && window.Encoder && window.Encoder.createADPCMEncoder) {
			encoder_ = window.Encoder.createADPCMEncoder(audioSamplesPerSec_);
		}
		converter_ = null;
		if (encoder_ && encoder_.convert) {
			converter_ = encoder_;
		}
		if (recorder_.TRACE) if (encoder_) recorder_.TRACE("INFO: prepared encoder: " + encoder_.version);
		// -->
		waveData_ = [];
		waveFile_ = null;
		reason_.code = 0;
		reason_.message = "";
		if (audioDecimationFactor_ > 1) {
			if (recorder_.recorded) {
				audioProcessor_.port.onmessage = audioProcessor_onaudioprocess_downSampling_recorded_;
			} else {
				audioProcessor_.port.onmessage = audioProcessor_onaudioprocess_downSampling_;
			}
		} else {
			if (recorder_.recorded) {
				audioProcessor_.port.onmessage = audioProcessor_onaudioprocess_recorded_;
			} else {
				audioProcessor_.port.onmessage = audioProcessor_onaudioprocess_;
			}
		}
		const stopTracks = function () {
			var tracks = this.getTracks();
			for (var i = 0; i < tracks.length; i++) {
				tracks[i].stop();
			}
			if (!recorder_.recorded) {
				if (!encoder_) {
					var waveDataBytes = 0;
					for (var i = 0; i < waveData_.length; i++) {
						waveDataBytes += waveData_[i].byteLength;
					}
					var waveData = new Uint8Array(44);
					waveData[ 0] = 0x52; // 'R'
					waveData[ 1] = 0x49; // 'I'
					waveData[ 2] = 0x46; // 'F'
					waveData[ 3] = 0x46; // 'F'
					waveData[ 4] = (waveDataBytes + 36) & 0xFF;
					waveData[ 5] = ((waveDataBytes + 36) >> 8) & 0xFF;
					waveData[ 6] = ((waveDataBytes + 36) >> 16) & 0xFF;
					waveData[ 7] = ((waveDataBytes + 36) >> 24) & 0xFF;
					waveData[ 8] = 0x57; // 'W'
					waveData[ 9] = 0x41; // 'A'
					waveData[10] = 0x56; // 'V'
					waveData[11] = 0x45; // 'E'
					waveData[12] = 0x66; // 'f'
					waveData[13] = 0x6D; // 'm'
					waveData[14] = 0x74; // 't'
					waveData[15] = 0x20; // ' '
					waveData[16] = 16;
					waveData[17] = 0;
					waveData[18] = 0;
					waveData[19] = 0;
					waveData[20] = 1; // formatTag
					waveData[21] = 0;
					waveData[22] = 1; // channels
					waveData[23] = 0;
					waveData[24] = audioSamplesPerSec_ & 0xFF; // samplesPerSec
					waveData[25] = (audioSamplesPerSec_ >> 8) & 0xFF;
					waveData[26] = (audioSamplesPerSec_ >> 16) & 0xFF;
					waveData[27] = (audioSamplesPerSec_ >> 24) & 0xFF;
					waveData[28] = (audioSamplesPerSec_ * 2 * 1) & 0xFF; // bytesPseSec
					waveData[29] = ((audioSamplesPerSec_ * 2 * 1) >> 8) & 0xFF;
					waveData[30] = ((audioSamplesPerSec_ * 2 * 1) >> 16) & 0xFF;
					waveData[31] = ((audioSamplesPerSec_ * 2 * 1) >> 24) & 0xFF;
					waveData[32] = 2 * 1; // bytesPerSample
					waveData[33] = 0;
					waveData[34] = 16; // bitsPerSample
					waveData[35] = 0;
					waveData[36] = 0x64; // 'd'
					waveData[37] = 0x61; // 'a'
					waveData[38] = 0x74; // 't'
					waveData[39] = 0x61; // 'a'
					waveData[40] = waveDataBytes & 0xFF;
					waveData[41] = (waveDataBytes >> 8) & 0xFF;
					waveData[42] = (waveDataBytes >> 16) & 0xFF;
					waveData[43] = (waveDataBytes >> 24) & 0xFF;
					waveData_.unshift(waveData);
					waveFile_ = new Blob(waveData_, {type: "audio/wav"});
					waveFile_.samples = waveDataBytes / (2 * 1);
					waveFile_.samplesPerSec = audioSamplesPerSec_;
					waveFile_.extension = ".wav";
				} else {
					if (converter_) {
						waveData_ = converter_.convert(waveData_);
					}
					waveFile_ = new Blob(waveData_, {type: encoder_.mime});
					waveFile_.samples = encoder_.samples;
					waveFile_.samplesPerSec = encoder_.samplesPerSec;
					waveFile_.extension = encoder_.extension;
				}
				waveData_ = null;
			}
			if (encoder_) {
				encoder_.destroy();
				encoder_ = null;
			}
			state_ = 0;
			if (recorder_.pauseEnded) recorder_.pauseEnded(reason_, waveFile_);
		};
		try {
			if (recorder_.recordingSource < 1 || recorder_.recordingSource > 3) {
				recorder_.recordingSource = 1;
			}
			let audioStream;
			if (recorder_.recordingSource === 1) {
				audioStream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false}, video: false});
				audioStream.stopTracks = stopTracks;
			} else
			if (recorder_.recordingSource === 2) {
				audioStream = await navigator.mediaDevices.getDisplayMedia({audio: {echoCancellation: false}, video: true});
				audioStream.stopTracks = stopTracks;
			} else {
				audioStream = new MediaStream();
				audioStream.userMedia_ = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false}, video: false});
				audioStream.displayMedia_ = await navigator.mediaDevices.getDisplayMedia({audio: {echoCancellation: false}, video: true});
				const destination = audioContext_.createMediaStreamDestination();
				audioContext_.createMediaStreamSource(audioStream.userMedia_).connect(destination);
				audioContext_.createMediaStreamSource(audioStream.displayMedia_).connect(destination);
				audioStream.addTrack(destination.stream.getTracks()[0]);
				audioStream.stopTracks_ = stopTracks;
				audioStream.stopTracks = function () {
					this.userMedia_.getTracks().forEach(track => track.stop());
					this.displayMedia_.getTracks().forEach(track => track.stop());
					this.stopTracks_();
				}
			}
			if (state_ === 3) {
				state_ = 4;
				audioStream.stopTracks();
				if (audioDecimationFactor_ > 1) {
					if (recorder_.TRACE) recorder_.TRACE("INFO: cancelled recording: " + audioContext_.sampleRate + "Hz -> " + audioSamplesPerSec_ + "Hz (" + audioProcessor_.bufferSize + " samples/buffer)");
				} else {
					if (recorder_.TRACE) recorder_.TRACE("INFO: cancelled recording: " + audioSamplesPerSec_ + "Hz (" + audioProcessor_.bufferSize + " samples/buffer)");
				}
				return false;
			}
			state_ = 2;
			audioStream_ = audioStream;
			audioProvider_ = audioContext_.createMediaStreamSource(audioStream_);
			audioProvider_.connect(audioProcessor_);
			audioProcessor_.connect(audioContext_.destination);
			if (audioDecimationFactor_ > 1) {
				if (recorder_.TRACE) recorder_.TRACE("INFO: started recording: " + audioContext_.sampleRate + "Hz -> " + audioSamplesPerSec_ + "Hz (" + audioProcessor_.bufferSize + " samples/buffer)");
			} else {
				if (recorder_.TRACE) recorder_.TRACE("INFO: started recording: " + audioSamplesPerSec_ + "Hz (" + audioProcessor_.bufferSize + " samples/buffer)");
			}
			startMaxRecordingTimeTimer_();
			var bytesPerSec = (encoder_) ? encoder_.bytesPerSec : audioSamplesPerSec_ * 2;
			var framesPerSec = (encoder_) ? encoder_.framesPerSec : 0;
			if (recorder_.resumeEnded) recorder_.resumeEnded(((encoder_) ? "" : "LSB") + (audioSamplesPerSec_ / 1000 | 0) + "K", bytesPerSec, framesPerSec);
		} catch (error) {
			state_ = 0;
			if (recorder_.TRACE) recorder_.TRACE("ERROR: can't start recording (" + error.message + ")");
			reason_.code = 2;
			reason_.message = error.message;
			if (recorder_.pauseEnded) recorder_.pauseEnded(reason_, waveFile_);
		}
		return true;
	}

	// 録音の停止
	function pause_() {
		if (state_ !== 2) {
			if (recorder_.TRACE) recorder_.TRACE("ERROR: can't stop recording (invalid state: " + state_ + ")");
			return false;
		}
		state_ = 3;
		if (recorder_.pauseStarted) recorder_.pauseStarted();
		stopMaxRecordingTimeTimer_();
		return true;
	}

	// 録音中かどうかの取得
	function isActive_() {
		return (state_ === 2);
	}

	// コンバーダの取得
	function getConverter_() {
		return converter_;
	}

	// 録音の停止を自動的に行うためのタイマの開始
	function startMaxRecordingTimeTimer_() {
		if (recorder_.maxRecordingTime <= 0) {
			return;
		}
		stopMaxRecordingTimeTimer_();
		maxRecordingTimeTimerId_ = setTimeout(fireMaxRecordingTimeTimer_, recorder_.maxRecordingTime);
		if (recorder_.TRACE) recorder_.TRACE("INFO: started auto pause timeout timer: " + recorder_.maxRecordingTime);
	}

	// 録音の停止を自動的に行うためのタイマの停止
	function stopMaxRecordingTimeTimer_() {
		if (maxRecordingTimeTimerId_ !== null) {
			clearTimeout(maxRecordingTimeTimerId_);
			maxRecordingTimeTimerId_ = null;
			if (recorder_.TRACE) recorder_.TRACE("INFO: stopped auto pause timeout timer: " + recorder_.maxRecordingTime);
		}
	}

	// 録音の停止を自動的に行うためのタイマの発火
	function fireMaxRecordingTimeTimer_() {
		if (recorder_.TRACE) recorder_.TRACE("INFO: fired auto pause timeout timer: " + recorder_.maxRecordingTime);
		reason_.code = 1;
		reason_.message = "Exceeded max recording time";
		pause_();
	}

	// public プロパティの初期化
	if (window.Encoder && window.Encoder.ADPCMEncoder) {
		recorder_.version += " " + window.Encoder.ADPCMEncoder.version;
	}
	if (window.Encoder && window.Encoder.OpusEncoder) {
		recorder_.version += " " + window.Encoder.OpusEncoder.version;
	}

	// public オブジェクトの返却
	return recorder_;
}();

var Wrp = function () {
	// public オブジェクト
	var wrp_ = {
		// public プロパティ
		version: "Wrp/1.0.12",
		serverURL: "",
		serverURLElement: undefined,
		grammarFileNames: "",
		grammarFileNamesElement: undefined,
		mode: "",
		modeElement: undefined,
		profileId: "",
		profileIdElement: undefined,
		profileWords: "",
		profileWordsElement: undefined,
		segmenterType: "",
		segmenterTypeElement: undefined,
		segmenterProperties: "",
		segmenterPropertiesElement: undefined,
		keepFillerToken: "",
		keepFillerTokenElement: undefined,
		resultUpdatedInterval: "",
		resultUpdatedIntervalElement: undefined,
		maxDecodingTime: "",
		maxDecodingTimeElement: undefined,
		maxResponseTime: "",
		maxResponseTimeElement: undefined,
		maxDecodingRate: "",
		maxDecodingRateElement: undefined,
		targetResponseTime: "",
		targetResponseTimeElement: undefined,
		targetDecodingRate: "",
		targetDecodingRateElement: undefined,
		noInputTimeout: "",
		noInputTimeoutElement: undefined,
		recognitionTimeout: "",
		recognitionTimeoutElement: undefined,
		extension: "",
		extensionElement: undefined,
		authorization: "",
		authorizationElement: undefined,
		codec: "",
		codecElement: undefined,
		resultType: "",
		resultTypeElement: undefined,
		checkIntervalTime: 0,
		checkIntervalTimeElement: undefined,
		dataDuration: 200,
		dataDurationElement: undefined,
		dataBytes: 0,
		dataBytesElement: undefined,
		dataCount: 0,
		dataCountElement: undefined,
		issuerURL: "",
		issuerURLElement: undefined,
		sid: null,
		sidElement: undefined,
		spw: null,
		spwElement: undefined,
		epi: null,
		epiElement: undefined,
		// public メソッド
		connect: connect_,
		disconnect: disconnect_,
		feedDataResume: feedDataResume_,
		feedData: feedData_,
		feedDataPause: feedDataPause_,
		isConnected: isConnected_,
		isActive: isActive_,
		issue: issue_,
		// イベントハンドラ
		connectStarted: undefined,
		connectEnded: undefined,
		disconnectStarted: undefined,
		disconnectEnded: undefined,
		feedDataResumeStarted: undefined,
		feedDataResumeEnded: undefined,
		feedDataPauseStarted: undefined,
		feedDataPauseEnded: undefined,
		utteranceStarted: undefined,
		utteranceEnded: undefined,
		resultCreated: undefined,
		resultUpdated: undefined,
		resultFinalized: undefined,
		eventNotified: undefined,
		issueStarted: undefined,
		issueEnded: undefined,
		TRACE: undefined
	};

	// 通信関連
	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
	//  ┌───────────────────────────────┐
	//  │0(disconnected)                                               │
	//  └────────┬──────────────────────┘
	//           connect()↓↑onclose   ↑onclose     ↑onclose
	//  ┌─────────┴──┐    │    ┌───┴────────┐
	//  │1(connecting)           │    │    │8(disconnecting)        │
	//  └────────┬───┘    │    └────────────┘
	//              onopen│            │          ↑↑
	//                    ↓            │       ※1││disconnect()
	//  ┌───────────────┴─────┴┴────────┐
	//  │2(connected)                                                  │
	//  └────────┬──────────────────────┘
	//    feedDataResume()│↑                        ↑
	//            resume()↓│pauseEnded              │pauseEnded
	//  ┌─────────┴──┐          ┌───┴────────┐
	//  │3(waiting resumeEnded)  │    ┌─→│7(waiting pauseEnded)   │
	//  └────────┬───┘    │    └────────────┘
	//         resumeEnded│┌─────┘            ↑
	//                 's'││pause()                 │pause()
	//                    ↓│'s' error response      │'e' response
	//  ┌─────────┴──┐          ┌───┴────────┐
	//  │4(waiting 's' response) │          │6(waiting 'e' response) │
	//  └────────┬───┘          └────────────┘
	//        's' response│                          ↑'e'
	//                    ↓                          │feedDataPause()
	//  ┌──────────────────────┴────────┐
	//  │5(resumed)                                                    │
	//  └────────┬──────────────────────┘
	//          feedData()│                          ↑
	//                 'p'└─────────────┘
	//                                    ※1 error response・disconnect()
	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
	//  ┌───────────────────────────────┐
	//  │0(disconnected)                                               │
	//  └───────────────────────────────┘
	//    ↑pauseEnded                          ↑pauseEnded
	//  ┌┴─────────┐              ┌┴───────────┐
	//  │13                  ├──────→│17                      │
	//  └──────────┘resumeEnded   └────────────┘
	//    ↑                    pause()      pause()↑         onclose↑
	//    │onclose                          onclose├──┬──┐    │
	//  ┌┴┐                                    ┌┴┐┌┴┐┌┴┐┌┴┐
	//  │3 │                                    │4 ││5 ││6 ││7 │
	//  └─┘                                    └─┘└─┘└─┘└─┘
	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
	//  ┌───────────────────────────────┐
	//  │8(disconnecting)                                              │
	//  └───────────────────────────────┘
	//    ↑                    ┌─┐          ↑                  ┌─┐
	//    │                ┌→│13│          │              ┌→│17│
	//    │disconnect()    │  └─┘          │disconnect()  │  └─┘
	//    │pauseEnded      │onclose           │pauseEnded    │onclose
	//  ┌┴────────┴┐              ┌┴───────┴───┐
	//  │23                  ├──────→│27                      │
	//  └──────────┘resumeEnded   └────────────┘
	//    ↑                    pause()      pause()↑  error response↑
	//    │error resopnse            error response├──┬──┐    │
	//  ┌┴┐                                    ┌┴┐┌┴┐┌┴┐┌┴┐
	//  │3 │                                    │4 ││5 ││6 ││7 │
	//  └─┘                                    └─┘└─┘└─┘└─┘
	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
	//  ┌───────────────────────────────┐
	//  │0(disconnected)                                               │
	//  └───────────────────────────────┘
	//    ↑                                    ↑    ┌────────┐
	//    │                                    │┌→│2(connected)    │
	//    │                                    ││  └────────┘
	//    │                    ┌─┐          ││'e' response    ┌─┐
	//    │                ┌→│ 8│          ││            ┌→│ 8│
	//    │                │  └─┘          ││            │  └─┘
	//    │onclose         │※1        onclose││            │※1
	//  ┌┴────────┴┐              ┌┴┴──────┴───┐
	//  │34                  ├──────→│36                      │
	//  └──────────┘'s' response  └────────────┘
	//    ↑                    'e'              'e'↑                ↑
	//    │pauseEnded                    pauseEnded│      pauseEnded│
	//  ┌┴┐                                    ┌┴┐            ┌┴┐
	//  │4 │                                    │5 │            │6 │
	//  └─┘                                    └─┘            └─┘
	//                                    ※1 error response・disconnect()
	// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
	var state_ = 0;
	var socket_;
	var reason_;
	var checkIntervalTimeoutTimerId_ = null;
	var interlock_ = false;
	var recorder_ = window.Recorder || null;
	var converter_ = null;
	var data__ = null;
	var data_ = null;
	var dataBytes_ = 0;
	var maxDataBytes_ = 0;
	var dataCount_ = 0;
	var maxDataCount_ = 0;

	if (recorder_) {
		// 録音の開始処理が完了した時に呼び出されます。
		recorder_.resumeEnded = function (codec, bytesPerSec, framesPerSec) {
			if (wrp_.codecElement) {
				wrp_.codecElement.value = codec;
			} else {
				wrp_.codec = codec;
			}
			if (wrp_.dataDurationElement) wrp_.dataDuration = wrp_.dataDurationElement.value - 0;
			if (wrp_.dataBytesElement) {
				wrp_.dataBytesElement.value = bytesPerSec * wrp_.dataDuration / 1000 | 0;
			} else {
				wrp_.dataBytes = bytesPerSec * wrp_.dataDuration / 1000 | 0;
			}
			if (wrp_.dataCountElement) {
				wrp_.dataCountElement.value = framesPerSec * wrp_.dataDuration / 1000 | 0;
			} else {
				wrp_.dataCount = framesPerSec * wrp_.dataDuration / 1000 | 0;
			}
			if (state_ == 0) {
				connect_();
			} else
			if (state_ === 3) {
				state_ = 4;
				feedDataResume__();
			} else
			if (state_ === 13) {
				state_ = 17;
				recorder_.pause();
			} else
			if (state_ === 23) {
				state_ = 27;
				recorder_.pause();
			}
		};

		// 録音の開始処理が失敗した時または録音の停止処理が完了した時に呼び出されます。
		recorder_.pauseEnded = function (reason) {
			if (state_ == 0) {
				if (wrp_.feedDataResumeStarted) wrp_.feedDataResumeStarted();
				if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason);
			} else
			if (state_ === 3) {
				state_ = 2;
				if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason);
				if (interlock_) {
					disconnect_();
				}
			} else
			if (state_ === 4) {
				state_ = 34;
				reason_ = reason;
			} else
			if (state_ === 5) {
				state_ = 36;
				reason_ = reason;
				feedDataPause__();
			} else
			if (state_ === 6) {
				state_ = 36;
				reason_ = reason;
			} else
			if (state_ === 7) {
				state_ = 2;
				if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason);
				if (interlock_) {
					disconnect_();
				}
			} else
			if (state_ === 13 || state_ === 17) {
				state_ = 0;
				if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason_);
				if (wrp_.disconnectEnded) wrp_.disconnectEnded();
				interlock_ = false;
			} else
			if (state_ === 23 || state_ === 27) {
				state_ = 8;
				if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason_);
				if (wrp_.disconnectStarted) wrp_.disconnectStarted();
				socket_.close();
			}
		};

		// 音声データが録音された時に呼び出されます。
		recorder_.recorded = function (data) {
			if (state_ !== 5) {
				if (state_ > 0 && state_ < 5) {
					if (data__ === null) {
						data__ = [];
					}
					data = new Uint8Array(new Uint8Array(new Uint8Array(data.buffer)).buffer, data.byteOffset, data.byteLength); // deep copy
					data__.push(data);
					return;
				}
				return;
			}
			if (data__) {
				for (var i = 0; i < data__.length; i++) {
					feedData__(data__[i]);
				}
				data__ = null;
			}
			feedData__(data);
		};
	}

	// WebSocket のオープン
	function connect_() {
		if (state_ !== 0) {
			if (wrp_.TRACE) wrp_.TRACE("ERROR: can't connect to WebSocket server (Invalid state: " + state_ + ")");
			return false;
		}
		if (wrp_.connectStarted) wrp_.connectStarted();
		if (!window.WebSocket) {
			if (wrp_.TRACE) wrp_.TRACE("ERROR: can't start feeding data to HTTP server (Unsupported WebSocket class)");
			if (wrp_.disconnectEnded) wrp_.disconnectEnded();
			return true;
		}
		if (wrp_.serverURLElement) wrp_.serverURL = wrp_.serverURLElement.value;
		if (!wrp_.serverURL) {
			if (wrp_.TRACE) wrp_.TRACE("ERROR: can't connect to WebSocket server (Missing server URL)");
			if (wrp_.disconnectEnded) wrp_.disconnectEnded();
			return true;
		}
		try {
			if (wrp_.serverURL.startsWith("http://")) {
				wrp_.serverURL = "ws://" + wrp_.serverURL.substring(7);
			} else
			if (wrp_.serverURL.startsWith("https://")) {
				wrp_.serverURL = "wss://" + wrp_.serverURL.substring(8);
			}
			socket_ = new WebSocket(wrp_.serverURL);
		} catch (e) {
			if (wrp_.TRACE) wrp_.TRACE("ERROR: can't connect to WebSocket server (" + e.message + ")");
			if (wrp_.disconnectEnded) wrp_.disconnectEnded();
			return true;
		}
		state_ = 1;
		socket_.onopen = function (event) {
			state_ = 2;
			if (wrp_.TRACE) wrp_.TRACE("INFO: connected to WebSocket server: " + wrp_.serverURL);
			if (wrp_.connectEnded) wrp_.connectEnded();
			if (interlock_) {
				feedDataResume_();
			}
		};
		socket_.onclose = function (event) {
			if (state_ === 1) {
				state_ = 0;
				if (wrp_.TRACE) wrp_.TRACE("ERROR: can't connect to WebSocket server: " + wrp_.serverURL);
				if (wrp_.disconnectEnded) wrp_.disconnectEnded();
				if (recorder_) {
					recorder_.pause();
				}
				interlock_ = false;
			} else
			if (state_ === 2) {
				state_ = 0;
				if (wrp_.disconnectStarted) wrp_.disconnectStarted();
				if (wrp_.TRACE) wrp_.TRACE("ERROR: disconnected from WebSocket server");
				if (wrp_.disconnectEnded) wrp_.disconnectEnded();
				interlock_ = false;
			} else
			if (state_ === 3) {
				state_ = 13;
				if (wrp_.disconnectStarted) wrp_.disconnectStarted();
				if (wrp_.TRACE) wrp_.TRACE("ERROR: disconnected from WebSocket server");
				if (!reason_) {
					reason_ = {code: 3, message: "Disconnected from WebSocket server"};
				}
			} else
			if (state_ === 4 || state_ === 5 || state_ === 6) {
				if (state_ != 6) {
					if (wrp_.feedDataPauseStarted) wrp_.feedDataPauseStarted();
				}
				state_ = 17;
				if (wrp_.disconnectStarted) wrp_.disconnectStarted();
				if (wrp_.TRACE) wrp_.TRACE("ERROR: disconnected from WebSocket server");
				if (!reason_) {
					reason_ = {code: 3, message: "Disconnected from WebSocket server"};
				}
				if (recorder_) {
					recorder_.pause();
				} else {
					state_ = 0;
					if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason_);
					if (wrp_.disconnectEnded) wrp_.disconnectEnded();
				}
			} else
			if (state_ === 7) {
				state_ = 17;
				if (wrp_.disconnectStarted) wrp_.disconnectStarted();
				if (wrp_.TRACE) wrp_.TRACE("ERROR: disconnected from WebSocket server");
				if (!reason_) {
					reason_ = {code: 3, message: "Disconnected from WebSocket server"};
				}
			} else
			if (state_ === 8) {
				state_ = 0;
				if (wrp_.TRACE) wrp_.TRACE("INFO: disconnected from WebSocket server");
				if (wrp_.disconnectEnded) wrp_.disconnectEnded();
				interlock_ = false;
			} else
			if (state_ === 23) {
				state_ = 13;
				if (wrp_.disconnectStarted) wrp_.disconnectStarted();
				if (wrp_.TRACE) wrp_.TRACE("ERROR: disconnected from WebSocket server");
			} else
			if (state_ === 27) {
				state_ = 17;
				if (wrp_.disconnectStarted) wrp_.disconnectStarted();
				if (wrp_.TRACE) wrp_.TRACE("ERROR: disconnected from WebSocket server");
			} else
			if (state_ === 34 || state_ === 36) {
				state_ = 0;
				if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason_);
				if (wrp_.disconnectStarted) wrp_.disconnectStarted();
				if (wrp_.TRACE) wrp_.TRACE("ERROR: disconnected from WebSocket server");
				if (wrp_.disconnectEnded) wrp_.disconnectEnded();
				interlock_ = false;
			}
		};
		socket_.onmessage = function (event) {
			if (wrp_.TRACE) wrp_.TRACE("-> " + event.data);
			var tag = event.data[0];
			var body = event.data.substring(2);
			if (tag === 's') {
				if (body) {
					if (state_ === 2) {
						state_ = 8;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't start feeding data to WebSocket server (" + body + ")");
						if (wrp_.disconnectStarted) wrp_.disconnectStarted();
						socket_.close();
					} else
					if (state_ === 3) {
						state_ = 23;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't start feeding data to WebSocket server (" + body + ")");
						reason_ = {code: 3, message: body};
					} else
					if (state_ === 4) {
						state_ = 7;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't start feeding data to WebSocket server (" + body + ")");
						reason_ = {code: 3, message: body};
						if (recorder_) {
							recorder_.pause();
						} else {
							state_ = 2;
							if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason_);
						}
					} else
					if (state_ === 5 || state_ === 6) {
						if (state_ != 6) {
							if (wrp_.feedDataPauseStarted) wrp_.feedDataPauseStarted();
						}
						state_ = 27;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't start feeding data to WebSocket server (" + body + ")");
						reason_ = {code: 3, message: body};
						if (recorder_) {
							recorder_.pause();
						} else {
							state_ = 8;
							if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason_);
							if (wrp_.disconnectStarted) wrp_.disconnectStarted();
							socket_.close();
						}
					} else
					if (state_ === 7) {
						state_ = 27;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't start feeding data to WebSocket server (" + body + ")");
						reason_ = {code: 3, message: body};
					} else
					if (state_ === 34 || state_ === 36) {
						state_ = 8;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't start feeding data to WebSocket server (" + body + ")");
						if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason_);
						if (wrp_.disconnectStarted) wrp_.disconnectStarted();
						socket_.close();
					}
				} else {
					if (state_ === 4) {
						state_ = 5;
						if (wrp_.TRACE) wrp_.TRACE("INFO: started feeding data to WebSocket server");
						startCheckIntervalTimeoutTimer_();
						if (wrp_.feedDataResumeEnded) wrp_.feedDataResumeEnded();
					} else
					if (state_ === 34) {
						state_ = 36;
						if (wrp_.TRACE) wrp_.TRACE("INFO: started feeding data to WebSocket server");
						feedDataPause__();
					}
				}
			} else
			if (tag === 'p') {
				if (body) {
					if (state_ === 2) {
						state_ = 8;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't feed data to WebSocket server (" + body + ")");
						if (wrp_.disconnectStarted) wrp_.disconnectStarted();
						socket_.close();
					} else
					if (state_ === 3) {
						state_ = 23;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't feed data to WebSocket server (" + body + ")");
						reason_ = {code: 3, message: body};
					} else
					if (state_ === 4 || state_ === 5 || state_ === 6) {
						if (state_ != 6) {
							if (wrp_.feedDataPauseStarted) wrp_.feedDataPauseStarted();
						}
						state_ = 27;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't feed data to WebSocket server (" + body + ")");
						reason_ = {code: 3, message: body};
						if (recorder_) {
							recorder_.pause();
						} else {
							state_ = 8;
							if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason_);
							if (wrp_.disconnectStarted) wrp_.disconnectStarted();
							socket_.close();
						}
					} else
					if (state_ === 7) {
						state_ = 27;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't feed data to WebSocket server (" + body + ")");
						reason_ = {code: 3, message: body};
					} else
					if (state_ === 34 || state_ === 36) {
						state_ = 8;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't feed data to WebSocket server (" + body + ")");
						if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason_);
						if (wrp_.disconnectStarted) wrp_.disconnectStarted();
						socket_.close();
					}
				}
			} else
			if (tag === 'e') {
				if (body) {
					if (state_ === 2) {
						state_ = 8;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't stop feeding data to WebSocket server (" + body + ")");
						if (wrp_.disconnectStarted) wrp_.disconnectStarted();
						socket_.close();
					} else
					if (state_ === 3) {
						state_ = 23;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't stop feeding data to WebSocket server (" + body + ")");
						reason_ = {code: 3, message: body};
					} else
					if (state_ === 4 || state_ === 5 || state_ === 6) {
						if (state_ != 6) {
							if (wrp_.feedDataPauseStarted) wrp_.feedDataPauseStarted();
						}
						state_ = 27;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't stop feeding data to WebSocket server (" + body + ")");
						reason_ = {code: 3, message: body};
						if (recorder_) {
							recorder_.pause();
						} else {
							state_ = 8;
							if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason_);
							if (wrp_.disconnectStarted) wrp_.disconnectStarted();
							socket_.close();
						}
					} else
					if (state_ === 7) {
						state_ = 27;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't stop feeding data to WebSocket server (" + body + ")");
						reason_ = {code: 3, message: body};
					} else
					if (state_ === 34 || state_ === 36) {
						state_ = 8;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("ERROR: can't stop feeding data to WebSocket server (" + body + ")");
						if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason_);
						if (wrp_.disconnectStarted) wrp_.disconnectStarted();
						socket_.close();
					}
				} else {
					if (state_ === 6) {
						state_ = 7;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("INFO: stopped feeding data to WebSocket server");
						if (recorder_) {
							recorder_.pause();
						} else {
							state_ = 2;
							if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded({code: 0, message: ""});
						}
					} else
					if (state_ === 36) {
						state_ = 2;
						stopCheckIntervalTimeoutTimer_();
						if (wrp_.TRACE) wrp_.TRACE("INFO: stopped feeding data to WebSocket server");
						if (wrp_.feedDataPauseEnded) wrp_.feedDataPauseEnded(reason_);
						if (interlock_) {
							disconnect_();
						}
					}
				}
			} else
			if (tag === 'S') {
				if (wrp_.utteranceStarted) wrp_.utteranceStarted(body);
				stopCheckIntervalTimeoutTimer_();
			} else
			if (tag === 'E') {
				if (wrp_.utteranceEnded) wrp_.utteranceEnded(body);
			} else
			if (tag === 'C') {
				if (wrp_.resultCreated) wrp_.resultCreated();
			} else
			if (tag === 'U') {
				if (wrp_.resultUpdated) wrp_.resultUpdated(body);
			} else
			if (tag === 'A') {
				if (wrp_.resultFinalized) wrp_.resultFinalized(body);
				startCheckIntervalTimeoutTimer_();
			} else
			if (tag === 'R') {
				if (wrp_.resultFinalized) wrp_.resultFinalized("\x01\x01\x01\x01\x01" + body);
				startCheckIntervalTimeoutTimer_();
			} else
			if (tag === 'Q') {
				if (wrp_.eventNotified) wrp_.eventNotified(tag, body);
			} else
			if (tag === 'G') {
				if (wrp_.eventNotified) wrp_.eventNotified(tag, body);
			}
		};
		reason_ = null;
		return true;
	}

	// WebSocket のクローズ
	function disconnect_() {
		if (state_ === 5) {
			interlock_ = true;
			if (recorder_) {
				recorder_.TRACE = wrp_.TRACE;
			}
			return feedDataPause_();
		}
		if (state_ !== 2) {
			if (wrp_.TRACE) wrp_.TRACE("ERROR: can't disconnect from WebSocket server (Invalid state: " + state_ + ")");
			return false;
		}
		if (wrp_.disconnectStarted) wrp_.disconnectStarted();
		state_ = 8;
		socket_.close();
		return true;
	}

	// 音声データの供給の開始
	function feedDataResume_() {
		if (state_ === 0) {
			interlock_ = true;
			if (recorder_) {
				recorder_.TRACE = wrp_.TRACE;
			}
			// <!-- for Safari
			if (recorder_ && !recorder_.isActive()) {
				recorder_.resume();
				return true;
			}
			// -->
			return connect_();
		}
		if (state_ !== 2) {
			if (wrp_.TRACE) wrp_.TRACE("ERROR: can't start feeding data to WebSocket server (Invalid state: " + state_ + ")");
			return false;
		}
		if (wrp_.feedDataResumeStarted) wrp_.feedDataResumeStarted();
		state_ = 3;
		if (recorder_ && !recorder_.isActive()) {
			recorder_.resume();
			return true;
		}
		state_ = 4;
		feedDataResume__();
		return true;
	}
	function feedDataResume__() {
		if (wrp_.grammarFileNamesElement) wrp_.grammarFileNames = wrp_.grammarFileNamesElement.value;
		if (wrp_.modeElement) wrp_.mode = wrp_.modeElement.value;
		if (wrp_.profileIdElement) wrp_.profileId = wrp_.profileIdElement.value;
		if (wrp_.profileWordsElement) wrp_.profileWords = wrp_.profileWordsElement.value;
		if (wrp_.segmenterTypeElement) wrp_.segmenterType = wrp_.segmenterTypeElement.value;
		if (wrp_.segmenterPropertiesElement) wrp_.segmenterProperties = wrp_.segmenterPropertiesElement.value;
		if (wrp_.keepFillerTokenElement) wrp_.keepFillerToken = wrp_.keepFillerTokenElement.value;
		if (wrp_.resultUpdatedIntervalElement) wrp_.resultUpdatedInterval = wrp_.resultUpdatedIntervalElement.value;
		if (wrp_.maxDecodingTimeElement) wrp_.maxDecodingTime = wrp_.maxDecodingTimeElement.value;
		if (wrp_.maxResponseTimeElement) wrp_.maxResponseTime = wrp_.maxResponseTimeElement.value;
		if (wrp_.maxDecodingRateElement) wrp_.maxDecodingRate = wrp_.maxDecodingRateElement.value;
		if (wrp_.targetResponseTimeElement) wrp_.targetResponseTime = wrp_.targetResponseTimeElement.value;
		if (wrp_.targetDecodingRateElement) wrp_.targetDecodingRate = wrp_.targetDecodingRateElement.value;
		if (wrp_.noInputTimeoutElement) wrp_.noInputTimeout = wrp_.noInputTimeoutElement.value;
		if (wrp_.recognitionTimeoutElement) wrp_.recognitionTimeout = wrp_.recognitionTimeoutElement.value;
		if (wrp_.extensionElement) wrp_.extension = wrp_.extensionElement.value;
		if (wrp_.authorizationElement) wrp_.authorization = wrp_.authorizationElement.value;
		if (wrp_.codecElement) wrp_.codec = wrp_.codecElement.value;
		if (wrp_.resultTypeElement) wrp_.resultType = wrp_.resultTypeElement.value;
		if (wrp_.checkIntervalTimeElement) wrp_.checkIntervalTime = wrp_.checkIntervalTimeElement.value - 0;
		if (wrp_.dataDurationElement) wrp_.dataDuration = wrp_.dataDurationElement.value - 0;
		if (wrp_.dataBytesElement) wrp_.dataBytes = wrp_.dataBytesElement.value - 0;
		if (wrp_.dataCountElement) wrp_.dataCount = wrp_.dataCountElement.value - 0;
		var command = "s ";
		if (wrp_.codec) {
			command += wrp_.codec;
		} else {
			command += "MSB16K";
		}
		if (wrp_.grammarFileNames) {
			command += " " + wrp_.grammarFileNames;
			if (wrp_.grammarFileNames.indexOf('\x01') != -1 && !wrp_.grammarFileNames.endsWith("\x01")) {
				command += '\x01';
			}
		} else {
			command += " \x01";
		}
		if (wrp_.mode) {
			command += " mode=" + wrp_.mode;
		}
		if (wrp_.profileId) {
			command += " profileId=" + wrp_.profileId;
		}
		if (wrp_.profileWords) {
			command += " profileWords=\"" + wrp_.profileWords.replace(/"/g, "\"\"") + "\"";
		}
		if (wrp_.segmenterType) {
			command += " segmenterType=" + wrp_.segmenterType;
		}
		if (wrp_.segmenterProperties) {
			command += " segmenterProperties=\"" + wrp_.segmenterProperties.replace(/"/g, "\"\"") + "\"";
		}
		if (wrp_.keepFillerToken) {
			command += " keepFillerToken=" + wrp_.keepFillerToken;
		}
		if (wrp_.resultUpdatedInterval) {
			command += " resultUpdatedInterval=" + wrp_.resultUpdatedInterval;
		}
		if (wrp_.maxDecodingTime) {
			command += " maxDecodingTime=" + wrp_.maxDecodingTime;
		}
		if (wrp_.maxResponseTime) {
			command += " maxResponseTime=" + wrp_.maxResponseTime;
		}
		if (wrp_.maxDecodingRate) {
			command += " maxDecodingRate=" + wrp_.maxDecodingRate;
		}
		if (wrp_.targetResponseTime) {
			command += " targetResponseTime=" + wrp_.targetResponseTime;
		}
		if (wrp_.targetDecodingRate) {
			command += " targetDecodingRate=" + wrp_.targetDecodingRate;
		}
		if (wrp_.noInputTimeout) {
			command += " noInputTimeout=" + wrp_.noInputTimeout;
		}
		if (wrp_.recognitionTimeout) {
			command += " recognitionTimeout=" + wrp_.recognitionTimeout;
		}
		if (wrp_.extension) {
			command += " extension=\"" + wrp_.extension.replace(/"/g, "\"\"") + "\"";
		}
		if (wrp_.authorization) {
			command += " authorization=" + wrp_.authorization;
		}
		if (wrp_.resultType) {
			command += " resultType=" + wrp_.resultType;
		}
		socket_.send(command);
		if (wrp_.TRACE) wrp_.TRACE("<- " + command);
		// <!-- for buffering
		if (wrp_.dataBytes > 0) {
			if (!data_ || data_.length < 1 + wrp_.dataBytes) {
				data_ = new Uint8Array(1 + wrp_.dataBytes);
				data_[0] = 0x70; // 'p'
			}
			dataBytes_ = 1;
			maxDataBytes_ = 1 + wrp_.dataBytes;
			// <!-- for converting
			converter_ = recorder_.getConverter();
			if (converter_) {
				converter_.convert();
			}
			// -->
		} else {
			dataBytes_ = 0;
			maxDataBytes_ = 0;
			// <!-- for converting
			converter_ = null;
			// -->
		}
		if (wrp_.dataCount > 0) {
			dataCount_ = maxDataCount_ = wrp_.dataCount;
		} else {
			dataCount_ = maxDataCount_ = -1;
		}
		// -->
		return true;
	}

	// 音声データの供給
	function feedData_(data) {
		if (state_ !== 5) {
			if (state_ > 0 && state_ < 5) {
				if (data__ === null) {
					data__ = [];
				}
				data = new Uint8Array(new Uint8Array(new Uint8Array(data.buffer)).buffer, data.byteOffset, data.byteLength); // deep copy
				data__.push(data);
				return true;
			}
			return false;
		}
		if (data__) {
			for (var i = 0; i < data__.length; i++) {
				feedData__(data__[i]);
			}
			data__ = null;
		}
		feedData__(data);
		return true;
	}
	function feedData__(data) {
		// <!-- for buffering
		if (dataBytes_ > 0) {
			if (dataCount_ > 0) {
				dataCount_--;
			}
			if (dataBytes_ + data.length <= maxDataBytes_) {
				data_.set(data, dataBytes_);
				dataBytes_ += data.length;
				if (dataBytes_ >= maxDataBytes_ || dataCount_ === 0) {
					feedData___(new Uint8Array(data_.buffer, data_.byteOffset, dataBytes_));
					dataBytes_ = 1;
					dataCount_ = maxDataCount_;
				}
				return;
			}
			dataCount_ = maxDataCount_;
			if (dataBytes_ > 1) {
				feedData___(new Uint8Array(data_.buffer, data_.byteOffset, dataBytes_));
				dataBytes_ = 1;
				if (dataBytes_ + data.length <= maxDataBytes_) {
					data_.set(data, dataBytes_);
					dataBytes_ += data.length;
					if (dataBytes_ >= maxDataBytes_) {
						feedData___(new Uint8Array(data_.buffer, data_.byteOffset, dataBytes_));
						dataBytes_ = 1;
					}
					return;
				}
			}
		}
		// -->
		if (data.byteOffset >= 1) {
			data = new Uint8Array(data.buffer, data.byteOffset - 1, 1 + data.length);
			data[0] = 0x70; // 'p'
			feedData___(data);
		} else {
			var newData = new Uint8Array(1 + data.length);
			newData[0] = 0x70; // 'p'
			newData.set(data, 1);
			feedData___(newData);
		}
	}
	function feedData___(data) {
		if (converter_) {
			data = converter_.convert(data);
		}
		socket_.send(data);
	}

	// 音声データの供給の停止
	function feedDataPause_() {
		if (state_ !== 5) {
			if (wrp_.TRACE) wrp_.TRACE("ERROR: can't stop feeding data to WebSocket server (Invalid state: " + state_ + ")");
			return false;
		}
		// <!-- for buffering
		if (dataBytes_ > 1) {
			feedData___(new Uint8Array(data_.buffer, data_.byteOffset, dataBytes_));
			dataBytes_ = 1;
		}
		// -->
		if (wrp_.feedDataPauseStarted) wrp_.feedDataPauseStarted();
		state_ = 6;
		stopCheckIntervalTimeoutTimer_();
		feedDataPause__();
		return true;
	}
	function feedDataPause__() {
		var command = "e";
		socket_.send(command);
		if (wrp_.TRACE) wrp_.TRACE("<- " + command);
		return true;
	}

	// 音声認識サーバに接続中かどうかの取得
	function isConnected_() {
		return (state_ === 2 || state_ === 3 || state_ === 4 || state_ === 5 || state_ === 6 || state_ === 7 || state_ === 23 || state_ === 27 || state_ === 34 || state_ === 36);
	}

	// 音声データの供給中かどうかの取得
	function isActive_() {
		return (state_ === 5);
	}

	// 録音の停止を自動的に行うためのタイマの開始
	function startCheckIntervalTimeoutTimer_() {
		if (wrp_.checkIntervalTime - 1000 <= 0) {
			return;
		}
		stopCheckIntervalTimeoutTimer_();
		checkIntervalTimeoutTimerId_ = setTimeout(fireCheckIntervalTimeoutTimer_, wrp_.checkIntervalTime - 1000);
		if (wrp_.TRACE) wrp_.TRACE("INFO: started check interval time timer: " + wrp_.checkIntervalTime + "(-1000)");
	}

	// 録音の停止を自動的に行うためのタイマの停止
	function stopCheckIntervalTimeoutTimer_() {
		if (checkIntervalTimeoutTimerId_ !== null) {
			clearTimeout(checkIntervalTimeoutTimerId_);
			checkIntervalTimeoutTimerId_ = null;
			if (wrp_.TRACE) wrp_.TRACE("INFO: stopped check interval time timer: " + wrp_.checkIntervalTime + "(-1000)");
		}
	}

	// 録音の停止を自動的に行うためのタイマの発火
	function fireCheckIntervalTimeoutTimer_() {
		if (wrp_.TRACE) wrp_.TRACE("INFO: fired check interval time timer: " + wrp_.checkIntervalTime + "(-1000)");
		feedDataPause_();
	}

	// サービス認証キー文字列の発行
	function issue_() {
		if (!window.XMLHttpRequest) {
			if (wrp_.TRACE) wrp_.TRACE("ERROR: can't issue service authorization (Unsupported XMLHttpRequest class)");
			return false;
		}
		if (wrp_.issuerURLElement) wrp_.issuerURL = wrp_.issuerURLElement.value;
		if (wrp_.sidElement) wrp_.sid = wrp_.sidElement.value;
		if (wrp_.spwElement) wrp_.spw = wrp_.spwElement.value;
		if (wrp_.epiElement) wrp_.epi = wrp_.epiElement.value;
		if (!wrp_.sid) {
			if (wrp_.TRACE) wrp_.TRACE("ERROR: can't issue service authorization (Missing service id)");
			alert("サービス ID が設定されていません。");
			if (wrp_.sidElement) wrp_.sidElement.focus();
			return false;
		}
		for (var i = 0; i < wrp_.sid.length; i++) {
			var c = wrp_.sid.charCodeAt(i);
			if (!(c >= 0x30 && c <= 0x39 || c >= 0x61 && c <= 0x7A || c >= 0x41 && c <= 0x5A || c === 0x2D || c === 0x5F)) {
				if (wrp_.TRACE) wrp_.TRACE("ERROR: can't issue service authorization (Illegal char in service id)");
				if (wrp_.sidElement) alert("サービス ID に許されていない文字が使用されています。");
				if (wrp_.sidElement) wrp_.sidElement.focus();
				return false;
			}
		}
		if (!wrp_.spw) {
			if (wrp_.TRACE) wrp_.TRACE("ERROR: can't issue service authorization (Missing service password)");
			alert("サービスパスワードが設定されていません。");
			if (wrp_.spwElement) wrp_.spwElement.focus();
			return false;
		}
		for (var i = 0; i < wrp_.spw.length; i++) {
			var c = wrp_.spw.charCodeAt(i);
			if (c < 0x20 || c > 0x7E) {
				if (wrp_.TRACE) wrp_.TRACE("ERROR: can't issue service authorization (Illegal char in service password)");
				if (wrp_.spwElement) alert("サービスパスワードに許されていない文字が使用されています。");
				if (wrp_.spwElement) wrp_.spwElement.focus();
				return false;
			}
		}
		for (var i = 0; i < wrp_.epi.length; i++) {
			var c = wrp_.epi.charCodeAt(i);
			if (c < 0x30 || c > 0x39) {
				if (wrp_.TRACE) wrp_.TRACE("ERROR: can't issue service authorization (Illegal char in pexires in)");
				if (wrp_.epiElement) alert("有効期限に許されていない文字が使用されています。");
				if (wrp_.epiElement) wrp_.epiElement.focus();
				return false;
			}
		}
		if (wrp_.issueStarted) wrp_.issueStarted();
		var searchParams = "sid=" + encodeURIComponent(wrp_.sid) + "&spw=" + encodeURIComponent(wrp_.spw);
		if (wrp_.epi) {
			searchParams += "&epi=" + encodeURIComponent(wrp_.epi);
		}
		var httpRequest = new XMLHttpRequest();
		httpRequest.addEventListener("load", function (e) {
			if (e.target.status === 200) {
				if (wrp_.serviceAuthorizationElement) {
					wrp_.serviceAuthorizationElement.value = e.target.response;
				} else
				if (wrp_.authorizationElement) {
					wrp_.authorizationElement.value = e.target.response;
				} else {
					wrp_.serviceAuthorization = e.target.response;
				}
				if (wrp_.issueEnded) wrp_.issueEnded(e.target.response);
			} else {
				if (wrp_.issueEnded) wrp_.issueEnded("");
			}
		});
		httpRequest.addEventListener("error", function (e) {
			if (wrp_.issueEnded) wrp_.issueEnded("");
		});
		httpRequest.addEventListener("abort", function (e) {
			if (wrp_.issueEnded) wrp_.issueEnded("");
		});
		httpRequest.addEventListener("timeout", function (e) {
			if (wrp_.issueEnded) wrp_.issueEnded("");
		});
		httpRequest.open("POST", wrp_.issuerURL, true);
		httpRequest.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
		httpRequest.send(searchParams);
		return true;
	}

	// public プロパティの初期化
	if (recorder_) {
		wrp_.version += " " + recorder_.version;
	}
	wrp_.serverURL = window.location.protocol + "//" + window.location.host + window.location.pathname;
	wrp_.serverURL = wrp_.serverURL.substring(0, wrp_.serverURL.lastIndexOf('/') + 1);
	if (wrp_.serverURL.endsWith("/tool/")) {
		wrp_.serverURL = wrp_.serverURL.substring(0, wrp_.serverURL.length - 5);
	}
	wrp_.serverURL += "/";
	wrp_.grammarFileNames = "-a-general";
	wrp_.issuerURL = window.location.protocol + "//" + window.location.host + window.location.pathname;
	wrp_.issuerURL = wrp_.issuerURL.substring(0, wrp_.issuerURL.lastIndexOf('/'));
	if (wrp_.issuerURL.indexOf("/tool", wrp_.issuerURL.length - 5) !== -1) {
		wrp_.issuerURL = wrp_.issuerURL.substring(0, wrp_.issuerURL.length - 5);
	}
	wrp_.issuerURL += "/issue_service_authorization";

	// public オブジェクトの返却
	return wrp_;
}();

