(() => {
  // lib/utils.js
  var atob = globalThis.atob;
  var btoa = globalThis.btoa;
  var RealtimeUtils = class {
    /**
     * Converts Float32Array of amplitude data to ArrayBuffer in Int16Array format
     * @param {Float32Array} float32Array
     * @returns {ArrayBuffer}
     */
    static floatTo16BitPCM(float32Array) {
      const buffer = new ArrayBuffer(float32Array.length * 2);
      const view = new DataView(buffer);
      let offset = 0;
      for (let i = 0; i < float32Array.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, float32Array[i]));
        view.setInt16(offset, s < 0 ? s * 32768 : s * 32767, true);
      }
      return buffer;
    }
    /**
     * Converts a base64 string to an ArrayBuffer
     * @param {string} base64
     * @returns {ArrayBuffer}
     */
    static base64ToArrayBuffer(base64) {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }
    /**
     * Converts an ArrayBuffer, Int16Array or Float32Array to a base64 string
     * @param {ArrayBuffer|Int16Array|Float32Array} arrayBuffer
     * @returns {string}
     */
    static arrayBufferToBase64(arrayBuffer) {
      if (arrayBuffer instanceof Float32Array) {
        arrayBuffer = this.floatTo16BitPCM(arrayBuffer);
      } else if (arrayBuffer instanceof Int16Array) {
        arrayBuffer = arrayBuffer.buffer;
      }
      let binary = "";
      let bytes = new Uint8Array(arrayBuffer);
      const chunkSize = 32768;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        let chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
      }
      return btoa(binary);
    }
    /**
     * Merge two Int16Arrays from Int16Arrays or ArrayBuffers
     * @param {ArrayBuffer|Int16Array} left
     * @param {ArrayBuffer|Int16Array} right
     * @returns {Int16Array}
     */
    static mergeInt16Arrays(left, right) {
      if (left instanceof ArrayBuffer) {
        left = new Int16Array(left);
      }
      if (right instanceof ArrayBuffer) {
        right = new Int16Array(right);
      }
      if (!(left instanceof Int16Array) || !(right instanceof Int16Array)) {
        throw new Error(`Both items must be Int16Array`);
      }
      const newValues = new Int16Array(left.length + right.length);
      for (let i = 0; i < left.length; i++) {
        newValues[i] = left[i];
      }
      for (let j = 0; j < right.length; j++) {
        newValues[left.length + j] = right[j];
      }
      return newValues;
    }
    /**
     * Generates an id to send with events and messages
     * @param {string} prefix
     * @param {number} [length]
     * @returns {string}
     */
    static generateId(prefix, length = 21) {
      const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
      const str = Array(length - prefix.length).fill(0).map((_) => chars[Math.floor(Math.random() * chars.length)]).join("");
      return `${prefix}${str}`;
    }
  };

  // lib/event_handler.js
  var sleep = (t) => new Promise((r) => setTimeout(() => r(), t));
  var RealtimeEventHandler = class {
    /**
     * Create a new RealtimeEventHandler instance
     * @returns {RealtimeEventHandler}
     */
    constructor() {
      this.eventHandlers = {};
      this.nextEventHandlers = {};
    }
    /**
     * Clears all event handlers
     * @returns {true}
     */
    clearEventHandlers() {
      this.eventHandlers = {};
      this.nextEventHandlers = {};
      return true;
    }
    /**
     * Listen to specific events
     * @param {string} eventName The name of the event to listen to
     * @param {EventHandlerCallbackType} callback Code to execute on event
     * @returns {EventHandlerCallbackType}
     */
    on(eventName, callback) {
      this.eventHandlers[eventName] = this.eventHandlers[eventName] || [];
      this.eventHandlers[eventName].push(callback);
      return callback;
    }
    /**
     * Listen for the next event of a specified type
     * @param {string} eventName The name of the event to listen to
     * @param {EventHandlerCallbackType} callback Code to execute on event
     * @returns {EventHandlerCallbackType}
     */
    onNext(eventName, callback) {
      this.nextEventHandlers[eventName] = this.nextEventHandlers[eventName] || [];
      this.nextEventHandlers[eventName].push(callback);
      return callback;
    }
    /**
     * Turns off event listening for specific events
     * Calling without a callback will remove all listeners for the event
     * @param {string} eventName
     * @param {EventHandlerCallbackType} [callback]
     * @returns {true}
     */
    off(eventName, callback) {
      const handlers = this.eventHandlers[eventName] || [];
      if (callback) {
        const index = handlers.indexOf(callback);
        if (index === -1) {
          throw new Error(
            `Could not turn off specified event listener for "${eventName}": not found as a listener`
          );
        }
        handlers.splice(index, 1);
      } else {
        delete this.eventHandlers[eventName];
      }
      return true;
    }
    /**
     * Turns off event listening for the next event of a specific type
     * Calling without a callback will remove all listeners for the next event
     * @param {string} eventName
     * @param {EventHandlerCallbackType} [callback]
     * @returns {true}
     */
    offNext(eventName, callback) {
      const nextHandlers = this.nextEventHandlers[eventName] || [];
      if (callback) {
        const index = nextHandlers.indexOf(callback);
        if (index === -1) {
          throw new Error(
            `Could not turn off specified next event listener for "${eventName}": not found as a listener`
          );
        }
        nextHandlers.splice(index, 1);
      } else {
        delete this.nextEventHandlers[eventName];
      }
      return true;
    }
    /**
     * Waits for next event of a specific type and returns the payload
     * @param {string} eventName
     * @param {number|null} [timeout]
     * @returns {Promise<{[key: string]: any}|null>}
     */
    async waitForNext(eventName, timeout = null) {
      const t0 = Date.now();
      let nextEvent;
      this.onNext(eventName, (event) => nextEvent = event);
      while (!nextEvent) {
        if (timeout) {
          const t1 = Date.now();
          if (t1 - t0 > timeout) {
            return null;
          }
        }
        await sleep(1);
      }
      return nextEvent;
    }
    /**
     * Executes all events in the order they were added, with .on() event handlers executing before .onNext() handlers
     * @param {string} eventName
     * @param {any} event
     * @returns {true}
     */
    dispatch(eventName, event) {
      const handlers = [].concat(this.eventHandlers[eventName] || []);
      for (const handler of handlers) {
        handler(event);
      }
      const nextHandlers = [].concat(this.nextEventHandlers[eventName] || []);
      for (const nextHandler of nextHandlers) {
        nextHandler(event);
      }
      delete this.nextEventHandlers[eventName];
      return true;
    }
  };

  // lib/api.js
  var RealtimeAPI = class extends RealtimeEventHandler {
    /**
     * Create a new RealtimeAPI instance
     * @param {{url?: string, apiKey?: string, dangerouslyAllowAPIKeyInBrowser?: boolean, debug?: boolean}} [settings]
     * @returns {RealtimeAPI}
     */
    constructor({ url, apiKey, dangerouslyAllowAPIKeyInBrowser, debug } = {}) {
      super();
      this.defaultUrl = "wss://api.openai.com/v1/realtime";
      this.url = url || this.defaultUrl;
      this.apiKey = apiKey || null;
      this.debug = !!debug;
      this.ws = null;
      if (globalThis.document && this.apiKey) {
        if (!dangerouslyAllowAPIKeyInBrowser) {
          throw new Error(
            `Can not provide API key in the browser without "dangerouslyAllowAPIKeyInBrowser" set to true`
          );
        }
      }
    }
    /**
     * Tells us whether or not the WebSocket is connected
     * @returns {boolean}
     */
    isConnected() {
      return !!this.ws;
    }
    /**
     * Writes WebSocket logs to console
     * @param  {...any} args
     * @returns {true}
     */
    log(...args) {
      const date = (/* @__PURE__ */ new Date()).toISOString();
      const logs = [`[Websocket/${date}]`].concat(args).map((arg) => {
        if (typeof arg === "object" && arg !== null) {
          return JSON.stringify(arg, null, 2);
        } else {
          return arg;
        }
      });
      if (this.debug) {
        console.log(...logs);
      }
      return true;
    }
    /**
     * Connects to Realtime API Websocket Server
     * @param {{model?: string}} [settings]
     * @returns {Promise<true>}
     */
    async connect(model = "gpt-4o-realtime-preview-2024-10-01") {
      if (!this.apiKey && this.url === this.defaultUrl) {
        console.warn(`No apiKey provided for connection to "${this.url}"`);
      }
      if (this.isConnected()) {
        throw new Error(`Already connected`);
      }
      console.log("Connecting to model: ", model);
      if (globalThis.WebSocket) {
        if (globalThis.document && this.apiKey) {
          console.warn(
            "Warning: Connecting using API key in the browser, this is not recommended"
          );
        }
        const WebSocket = globalThis.WebSocket;
        const ws = new WebSocket(`${this.url}${model ? `?model=${model}` : ""}`, [
          "realtime",
          `openai-insecure-api-key.${this.apiKey}`,
          "openai-beta.realtime-v1"
        ]);
        ws.addEventListener("message", (event) => {
          const message = JSON.parse(event.data);
          this.receive(message.type, message);
        });
        return new Promise((resolve, reject) => {
          const connectionErrorHandler = () => {
            this.disconnect(ws);
            reject(new Error(`Could not connect to "${this.url}"`));
          };
          ws.addEventListener("error", connectionErrorHandler);
          ws.addEventListener("open", () => {
            this.log(`Connected to "${this.url}"`);
            ws.removeEventListener("error", connectionErrorHandler);
            ws.addEventListener("error", () => {
              this.disconnect(ws);
              this.log(`Error, disconnected from "${this.url}"`);
              this.dispatch("close", { error: true });
            });
            ws.addEventListener("close", () => {
              this.disconnect(ws);
              this.log(`Disconnected from "${this.url}"`);
              this.dispatch("close", { error: false });
            });
            this.ws = ws;
            resolve(true);
          });
        });
      } else {
        const moduleName = "ws";
        const wsModule = await import(
          /* webpackIgnore: true */
          moduleName
        );
        const WebSocket = wsModule.default;
        const ws = new WebSocket(
          "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01",
          [],
          {
            finishRequest: (request) => {
              request.setHeader("Authorization", `Bearer ${this.apiKey}`);
              request.setHeader("OpenAI-Beta", "realtime=v1");
              request.end();
            }
          }
        );
        ws.on("message", (data) => {
          const message = JSON.parse(data.toString());
          this.receive(message.type, message);
        });
        return new Promise((resolve, reject) => {
          const connectionErrorHandler = () => {
            this.disconnect(ws);
            reject(new Error(`Could not connect to "${this.url}"`));
          };
          ws.on("error", connectionErrorHandler);
          ws.on("open", () => {
            this.log(`Connected to "${this.url}"`);
            ws.removeListener("error", connectionErrorHandler);
            ws.on("error", () => {
              this.disconnect(ws);
              this.log(`Error, disconnected from "${this.url}"`);
              this.dispatch("close", { error: true });
            });
            ws.on("close", () => {
              this.disconnect(ws);
              this.log(`Disconnected from "${this.url}"`);
              this.dispatch("close", { error: false });
            });
            this.ws = ws;
            resolve(true);
          });
        });
      }
    }
    /**
     * Disconnects from Realtime API server
     * @param {WebSocket} [ws]
     * @returns {true}
     */
    disconnect(ws) {
      if (!ws || this.ws === ws) {
        this.ws && this.ws.close();
        this.ws = null;
        return true;
      }
    }
    /**
     * Receives an event from WebSocket and dispatches as "server.{eventName}" and "server.*" events
     * @param {string} eventName
     * @param {{[key: string]: any}} event
     * @returns {true}
     */
    receive(eventName, event) {
      this.log(`received:`, eventName, event);
      this.dispatch(`server.${eventName}`, event);
      this.dispatch("server.*", event);
      return true;
    }
    /**
     * Sends an event to WebSocket and dispatches as "client.{eventName}" and "client.*" events
     * @param {string} eventName
     * @param {{[key: string]: any}} event
     * @returns {true}
     */
    send(eventName, data) {
      if (!this.isConnected()) {
        throw new Error(`RealtimeAPI is not connected`);
      }
      data = data || {};
      if (typeof data !== "object") {
        throw new Error(`data must be an object`);
      }
      const event = {
        event_id: RealtimeUtils.generateId("evt_"),
        type: eventName,
        ...data
      };
      this.dispatch(`client.${eventName}`, event);
      this.dispatch("client.*", event);
      this.log(`sent:`, eventName, event);
      this.ws.send(JSON.stringify(event));
      return true;
    }
  };

  // lib/conversation.js
  var RealtimeConversation = class {
    defaultFrequency = 24e3;
    // 24,000 Hz
    EventProcessors = {
      "conversation.item.created": (event) => {
        const { item } = event;
        const newItem = JSON.parse(JSON.stringify(item));
        if (!this.itemLookup[newItem.id]) {
          this.itemLookup[newItem.id] = newItem;
          this.items.push(newItem);
        }
        newItem.formatted = {};
        newItem.formatted.audio = new Int16Array(0);
        newItem.formatted.text = "";
        newItem.formatted.transcript = "";
        if (this.queuedSpeechItems[newItem.id]) {
          newItem.formatted.audio = this.queuedSpeechItems[newItem.id].audio;
          delete this.queuedSpeechItems[newItem.id];
        }
        if (newItem.content) {
          const textContent = newItem.content.filter(
            (c) => ["text", "input_text"].includes(c.type)
          );
          for (const content of textContent) {
            newItem.formatted.text += content.text;
          }
        }
        if (this.queuedTranscriptItems[newItem.id]) {
          newItem.formatted.transcript = this.queuedTranscriptItems.transcript;
          delete this.queuedTranscriptItems[newItem.id];
        }
        if (newItem.type === "message") {
          if (newItem.role === "user") {
            newItem.status = "completed";
            if (this.queuedInputAudio) {
              newItem.formatted.audio = this.queuedInputAudio;
              this.queuedInputAudio = null;
            }
          } else {
            newItem.status = "in_progress";
          }
        } else if (newItem.type === "function_call") {
          newItem.formatted.tool = {
            type: "function",
            name: newItem.name,
            call_id: newItem.call_id,
            arguments: ""
          };
          newItem.status = "in_progress";
        } else if (newItem.type === "function_call_output") {
          newItem.status = "completed";
          newItem.formatted.output = newItem.output;
        }
        return { item: newItem, delta: null };
      },
      "conversation.item.truncated": (event) => {
        const { item_id, audio_end_ms } = event;
        const item = this.itemLookup[item_id];
        if (!item) {
          throw new Error(`item.truncated: Item "${item_id}" not found`);
        }
        const endIndex = Math.floor(
          audio_end_ms * this.defaultFrequency / 1e3
        );
        item.formatted.transcript = "";
        item.formatted.audio = item.formatted.audio.slice(0, endIndex);
        return { item, delta: null };
      },
      "conversation.item.deleted": (event) => {
        const { item_id } = event;
        const item = this.itemLookup[item_id];
        if (!item) {
          throw new Error(`item.deleted: Item "${item_id}" not found`);
        }
        delete this.itemLookup[item.id];
        const index = this.items.indexOf(item);
        if (index > -1) {
          this.items.splice(index, 1);
        }
        return { item, delta: null };
      },
      "conversation.item.input_audio_transcription.completed": (event) => {
        const { item_id, content_index, transcript } = event;
        const item = this.itemLookup[item_id];
        const formattedTranscript = transcript || " ";
        if (!item) {
          this.queuedTranscriptItems[item_id] = {
            transcript: formattedTranscript
          };
          return { item: null, delta: null };
        } else {
          item.content[content_index].transcript = transcript;
          item.formatted.transcript = formattedTranscript;
          return { item, delta: { transcript } };
        }
      },
      "input_audio_buffer.speech_started": (event) => {
        const { item_id, audio_start_ms } = event;
        this.queuedSpeechItems[item_id] = { audio_start_ms };
        return { item: null, delta: null };
      },
      "input_audio_buffer.speech_stopped": (event, inputAudioBuffer) => {
        const { item_id, audio_end_ms } = event;
        if (!this.queuedSpeechItems[item_id]) {
          this.queuedSpeechItems[item_id] = { audio_start_ms: audio_end_ms };
        }
        const speech = this.queuedSpeechItems[item_id];
        speech.audio_end_ms = audio_end_ms;
        if (inputAudioBuffer) {
          const startIndex = Math.floor(
            speech.audio_start_ms * this.defaultFrequency / 1e3
          );
          const endIndex = Math.floor(
            speech.audio_end_ms * this.defaultFrequency / 1e3
          );
          speech.audio = inputAudioBuffer.slice(startIndex, endIndex);
        }
        return { item: null, delta: null };
      },
      "response.created": (event) => {
        const { response } = event;
        if (!this.responseLookup[response.id]) {
          this.responseLookup[response.id] = response;
          this.responses.push(response);
        }
        return { item: null, delta: null };
      },
      "response.output_item.added": (event) => {
        const { response_id, item } = event;
        const response = this.responseLookup[response_id];
        if (!response) {
          throw new Error(
            `response.output_item.added: Response "${response_id}" not found`
          );
        }
        response.output.push(item.id);
        return { item: null, delta: null };
      },
      "response.output_item.done": (event) => {
        const { item } = event;
        if (!item) {
          throw new Error(`response.output_item.done: Missing "item"`);
        }
        const foundItem = this.itemLookup[item.id];
        if (!foundItem) {
          throw new Error(
            `response.output_item.done: Item "${item.id}" not found`
          );
        }
        foundItem.status = item.status;
        return { item: foundItem, delta: null };
      },
      "response.content_part.added": (event) => {
        const { item_id, part } = event;
        const item = this.itemLookup[item_id];
        if (!item) {
          throw new Error(
            `response.content_part.added: Item "${item_id}" not found`
          );
        }
        item.content.push(part);
        return { item, delta: null };
      },
      "response.audio_transcript.delta": (event) => {
        const { item_id, content_index, delta } = event;
        const item = this.itemLookup[item_id];
        if (!item) {
          throw new Error(
            `response.audio_transcript.delta: Item "${item_id}" not found`
          );
        }
        item.content[content_index].transcript += delta;
        item.formatted.transcript += delta;
        return { item, delta: { transcript: delta } };
      },
      "response.audio.delta": (event) => {
        const { item_id, content_index, delta } = event;
        const item = this.itemLookup[item_id];
        if (!item) {
          throw new Error(`response.audio.delta: Item "${item_id}" not found`);
        }
        const arrayBuffer = RealtimeUtils.base64ToArrayBuffer(delta);
        const appendValues = new Int16Array(arrayBuffer);
        item.formatted.audio = RealtimeUtils.mergeInt16Arrays(
          item.formatted.audio,
          appendValues
        );
        return { item, delta: { audio: appendValues } };
      },
      "response.text.delta": (event) => {
        const { item_id, content_index, delta } = event;
        const item = this.itemLookup[item_id];
        if (!item) {
          throw new Error(`response.text.delta: Item "${item_id}" not found`);
        }
        item.content[content_index].text += delta;
        item.formatted.text += delta;
        return { item, delta: { text: delta } };
      },
      "response.function_call_arguments.delta": (event) => {
        const { item_id, delta } = event;
        const item = this.itemLookup[item_id];
        if (!item) {
          throw new Error(
            `response.function_call_arguments.delta: Item "${item_id}" not found`
          );
        }
        item.arguments += delta;
        item.formatted.tool.arguments += delta;
        return { item, delta: { arguments: delta } };
      }
    };
    /**
     * Create a new RealtimeConversation instance
     * @returns {RealtimeConversation}
     */
    constructor() {
      this.clear();
    }
    /**
     * Clears the conversation history and resets to default
     * @returns {true}
     */
    clear() {
      this.itemLookup = {};
      this.items = [];
      this.responseLookup = {};
      this.responses = [];
      this.queuedSpeechItems = {};
      this.queuedTranscriptItems = {};
      this.queuedInputAudio = null;
      return true;
    }
    /**
     * Queue input audio for manual speech event
     * @param {Int16Array} inputAudio
     * @returns {Int16Array}
     */
    queueInputAudio(inputAudio) {
      this.queuedInputAudio = inputAudio;
      return inputAudio;
    }
    /**
     * Process an event from the WebSocket server and compose items
     * @param {Object} event
     * @param  {...any} args
     * @returns {item: import('./client.js').ItemType | null, delta: ItemContentDeltaType | null}
     */
    processEvent(event, ...args) {
      if (!event.event_id) {
        console.error(event);
        throw new Error(`Missing "event_id" on event`);
      }
      if (!event.type) {
        console.error(event);
        throw new Error(`Missing "type" on event`);
      }
      const eventProcessor = this.EventProcessors[event.type];
      if (!eventProcessor) {
        throw new Error(
          `Missing conversation event processor for "${event.type}"`
        );
      }
      return eventProcessor.call(this, event, ...args);
    }
    /**
     * Retrieves a item by id
     * @param {string} id
     * @returns {import('./client.js').ItemType}
     */
    getItem(id) {
      return this.itemLookup[id] || null;
    }
    /**
     * Retrieves all items in the conversation
     * @returns {import('./client.js').ItemType[]}
     */
    getItems() {
      return this.items.slice();
    }
  };

  // lib/client.js
  var RealtimeClient = class extends RealtimeEventHandler {
    /**
     * Create a new RealtimeClient instance
     * @param {RealtimeClientSettings} [settings]
     */
    constructor({
      url,
      apiKey,
      model,
      dangerouslyAllowAPIKeyInBrowser,
      debug
    } = {}) {
      super();
      this.defaultSessionConfig = {
        modalities: ["text", "audio"],
        instructions: "",
        voice: "verse",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: null,
        turn_detection: null,
        tools: [],
        tool_choice: "auto",
        temperature: 0.8,
        max_response_output_tokens: 4096
      };
      if (!model) {
        this.realtimeModel = "gpt-4o-realtime-preview-2024-10-01";
      } else {
        this.realtimeModel = model;
      }
      this.sessionConfig = {};
      this.transcriptionModels = [
        {
          model: "whisper-1"
        }
      ];
      this.defaultServerVadConfig = {
        type: "server_vad",
        threshold: 0.5,
        // 0.0 to 1.0,
        prefix_padding_ms: 300,
        // How much audio to include in the audio stream before the speech starts.
        silence_duration_ms: 200
        // How long to wait to mark the speech as stopped.
      };
      this.realtime = new RealtimeAPI({
        url,
        apiKey,
        dangerouslyAllowAPIKeyInBrowser,
        debug
      });
      this.conversation = new RealtimeConversation();
      this._resetConfig();
      this._addAPIEventHandlers();
    }
    /**
     * Resets sessionConfig and conversationConfig to default
     * @private
     * @returns {true}
     */
    _resetConfig() {
      this.sessionCreated = false;
      this.tools = {};
      this.sessionConfig = JSON.parse(JSON.stringify(this.defaultSessionConfig));
      this.inputAudioBuffer = new Int16Array(0);
      return true;
    }
    /**
     * Sets up event handlers for a fully-functional application control flow
     * @private
     * @returns {true}
     */
    _addAPIEventHandlers() {
      this.realtime.on("client.*", (event) => {
        const realtimeEvent = {
          time: (/* @__PURE__ */ new Date()).toISOString(),
          source: "client",
          event
        };
        this.dispatch("realtime.event", realtimeEvent);
      });
      this.realtime.on("server.*", (event) => {
        const realtimeEvent = {
          time: (/* @__PURE__ */ new Date()).toISOString(),
          source: "server",
          event
        };
        this.dispatch("realtime.event", realtimeEvent);
      });
      this.realtime.on(
        "server.session.created",
        () => this.sessionCreated = true
      );
      const handler = (event, ...args) => {
        const { item, delta } = this.conversation.processEvent(event, ...args);
        return { item, delta };
      };
      const handlerWithDispatch = (event, ...args) => {
        const { item, delta } = handler(event, ...args);
        if (item) {
          this.dispatch("conversation.updated", { item, delta });
        }
        return { item, delta };
      };
      const callTool = async (tool) => {
        try {
          const jsonArguments = JSON.parse(tool.arguments);
          const toolConfig = this.tools[tool.name];
          if (!toolConfig) {
            throw new Error(`Tool "${tool.name}" has not been added`);
          }
          const result = await toolConfig.handler(jsonArguments);
          this.realtime.send("conversation.item.create", {
            item: {
              type: "function_call_output",
              call_id: tool.call_id,
              output: JSON.stringify(result)
            }
          });
        } catch (e) {
          this.realtime.send("conversation.item.create", {
            item: {
              type: "function_call_output",
              call_id: tool.call_id,
              output: JSON.stringify({ error: e.message })
            }
          });
        }
        this.createResponse();
      };
      this.realtime.on("server.response.created", handler);
      this.realtime.on("server.response.output_item.added", handler);
      this.realtime.on("server.response.content_part.added", handler);
      this.realtime.on("server.input_audio_buffer.speech_started", (event) => {
        handler(event);
        this.dispatch("conversation.interrupted");
      });
      this.realtime.on(
        "server.input_audio_buffer.speech_stopped",
        (event) => handler(event, this.inputAudioBuffer)
      );
      this.realtime.on("server.conversation.item.created", (event) => {
        const { item } = handlerWithDispatch(event);
        this.dispatch("conversation.item.appended", { item });
        if (item.status === "completed") {
          this.dispatch("conversation.item.completed", { item });
        }
      });
      this.realtime.on("server.conversation.item.truncated", handlerWithDispatch);
      this.realtime.on("server.conversation.item.deleted", handlerWithDispatch);
      this.realtime.on(
        "server.conversation.item.input_audio_transcription.completed",
        handlerWithDispatch
      );
      this.realtime.on(
        "server.response.audio_transcript.delta",
        handlerWithDispatch
      );
      this.realtime.on("server.response.audio.delta", handlerWithDispatch);
      this.realtime.on("server.response.text.delta", handlerWithDispatch);
      this.realtime.on(
        "server.response.function_call_arguments.delta",
        handlerWithDispatch
      );
      this.realtime.on("server.response.output_item.done", async (event) => {
        const { item } = handlerWithDispatch(event);
        if (item.status === "completed") {
          this.dispatch("conversation.item.completed", { item });
        }
        if (item.formatted.tool) {
          callTool(item.formatted.tool);
        }
      });
      return true;
    }
    /**
     * Tells us whether the realtime socket is connected and the session has started
     * @returns {boolean}
     */
    isConnected() {
      return this.realtime.isConnected();
    }
    /**
     * Resets the client instance entirely: disconnects and clears active config
     * @returns {true}
     */
    reset() {
      this.disconnect();
      this.clearEventHandlers();
      this.realtime.clearEventHandlers();
      this._resetConfig();
      this._addAPIEventHandlers();
      return true;
    }
    /**
     * Connects to the Realtime WebSocket API
     * Updates session config and conversation config
     * @returns {Promise<true>}
     */
    async connect() {
      if (this.isConnected()) {
        throw new Error(`Already connected, use .disconnect() first`);
      }
      await this.realtime.connect(this.realtimeModel);
      this.updateSession();
      return true;
    }
    /**
     * Waits for a session.created event to be executed before proceeding
     * @returns {Promise<true>}
     */
    async waitForSessionCreated() {
      if (!this.isConnected()) {
        throw new Error(`Not connected, use .connect() first`);
      }
      while (!this.sessionCreated) {
        await new Promise((r) => setTimeout(() => r(), 1));
      }
      return true;
    }
    /**
     * Disconnects from the Realtime API and clears the conversation history
     */
    disconnect() {
      this.sessionCreated = false;
      this.realtime.isConnected() && this.realtime.disconnect();
      this.conversation.clear();
    }
    /**
     * Gets the active turn detection mode
     * @returns {"server_vad"|null}
     */
    getTurnDetectionType() {
      return this.sessionConfig.turn_detection?.type || null;
    }
    /**
     * Add a tool and handler
     * @param {ToolDefinitionType} definition
     * @param {function} handler
     * @returns {{definition: ToolDefinitionType, handler: function}}
     */
    addTool(definition, handler) {
      if (!definition?.name) {
        throw new Error(`Missing tool name in definition`);
      }
      const name = definition?.name;
      if (this.tools[name]) {
        throw new Error(
          `Tool "${name}" already added. Please use .removeTool("${name}") before trying to add again.`
        );
      }
      if (typeof handler !== "function") {
        throw new Error(`Tool "${name}" handler must be a function`);
      }
      this.tools[name] = { definition, handler };
      this.updateSession();
      return this.tools[name];
    }
    /**
     * Removes a tool
     * @param {string} name
     * @returns {true}
     */
    removeTool(name) {
      if (!this.tools[name]) {
        throw new Error(`Tool "${name}" does not exist, can not be removed.`);
      }
      delete this.tools[name];
      return true;
    }
    /**
     * Deletes an item
     * @param {string} id
     * @returns {true}
     */
    deleteItem(id) {
      this.realtime.send("conversation.item.delete", { item_id: id });
      return true;
    }
    /**
     * Updates session configuration
     * If the client is not yet connected, will save details and instantiate upon connection
     * @param {SessionResourceType} [sessionConfig]
     */
    updateSession({
      modalities = void 0,
      instructions = void 0,
      voice = void 0,
      input_audio_format = void 0,
      output_audio_format = void 0,
      input_audio_transcription = void 0,
      turn_detection = void 0,
      tools = void 0,
      tool_choice = void 0,
      temperature = void 0,
      max_response_output_tokens = void 0
    } = {}) {
      modalities !== void 0 && (this.sessionConfig.modalities = modalities);
      instructions !== void 0 && (this.sessionConfig.instructions = instructions);
      voice !== void 0 && (this.sessionConfig.voice = voice);
      input_audio_format !== void 0 && (this.sessionConfig.input_audio_format = input_audio_format);
      output_audio_format !== void 0 && (this.sessionConfig.output_audio_format = output_audio_format);
      input_audio_transcription !== void 0 && (this.sessionConfig.input_audio_transcription = input_audio_transcription);
      turn_detection !== void 0 && (this.sessionConfig.turn_detection = turn_detection);
      tools !== void 0 && (this.sessionConfig.tools = tools);
      tool_choice !== void 0 && (this.sessionConfig.tool_choice = tool_choice);
      temperature !== void 0 && (this.sessionConfig.temperature = temperature);
      max_response_output_tokens !== void 0 && (this.sessionConfig.max_response_output_tokens = max_response_output_tokens);
      const useTools = [].concat(
        (tools || []).map((toolDefinition) => {
          const definition = {
            type: "function",
            ...toolDefinition
          };
          if (this.tools[definition?.name]) {
            throw new Error(
              `Tool "${definition?.name}" has already been defined`
            );
          }
          return definition;
        }),
        Object.keys(this.tools).map((key) => {
          return {
            type: "function",
            ...this.tools[key].definition
          };
        })
      );
      const session = { ...this.sessionConfig };
      session.tools = useTools;
      if (this.realtime.isConnected()) {
        this.realtime.send("session.update", { session });
      }
      return true;
    }
    /**
     * Sends user message content and generates a response
     * @param {Array<InputTextContentType|InputAudioContentType>} content
     * @returns {true}
     */
    sendUserMessageContent(content = []) {
      if (content.length) {
        for (const c of content) {
          if (c.type === "input_audio") {
            if (c.audio instanceof ArrayBuffer || c.audio instanceof Int16Array) {
              c.audio = RealtimeUtils.arrayBufferToBase64(c.audio);
            }
          }
        }
        this.realtime.send("conversation.item.create", {
          item: {
            type: "message",
            role: "user",
            content
          }
        });
      }
      this.createResponse();
      return true;
    }
    /**
     * Appends user audio to the existing audio buffer
     * @param {Int16Array|ArrayBuffer} arrayBuffer
     * @returns {true}
     */
    appendInputAudio(arrayBuffer) {
      if (arrayBuffer.byteLength > 0) {
        this.realtime.send("input_audio_buffer.append", {
          audio: RealtimeUtils.arrayBufferToBase64(arrayBuffer)
        });
        this.inputAudioBuffer = RealtimeUtils.mergeInt16Arrays(
          this.inputAudioBuffer,
          arrayBuffer
        );
      }
      return true;
    }
    /**
     * Forces a model response generation
     * @returns {true}
     */
    createResponse() {
      if (this.getTurnDetectionType() === null && this.inputAudioBuffer.byteLength > 0) {
        this.realtime.send("input_audio_buffer.commit");
        this.conversation.queueInputAudio(this.inputAudioBuffer);
        this.inputAudioBuffer = new Int16Array(0);
      }
      this.realtime.send("response.create");
      return true;
    }
    /**
     * Cancels the ongoing server generation and truncates ongoing generation, if applicable
     * If no id provided, will simply call `cancel_generation` command
     * @param {string} id The id of the message to cancel
     * @param {number} [sampleCount] The number of samples to truncate past for the ongoing generation
     * @returns {{item: (AssistantItemType | null)}}
     */
    cancelResponse(id, sampleCount = 0) {
      if (!id) {
        this.realtime.send("response.cancel");
        return { item: null };
      } else if (id) {
        const item = this.conversation.getItem(id);
        if (!item) {
          throw new Error(`Could not find item "${id}"`);
        }
        if (item.type !== "message") {
          throw new Error(`Can only cancelResponse messages with type "message"`);
        } else if (item.role !== "assistant") {
          throw new Error(
            `Can only cancelResponse messages with role "assistant"`
          );
        }
        this.realtime.send("response.cancel");
        const audioIndex = item.content.findIndex((c) => c.type === "audio");
        if (audioIndex === -1) {
          throw new Error(`Could not find audio on item to cancel`);
        }
        this.realtime.send("conversation.item.truncate", {
          item_id: id,
          content_index: audioIndex,
          audio_end_ms: Math.floor(
            sampleCount / this.conversation.defaultFrequency * 1e3
          )
        });
        return { item };
      }
    }
    /**
     * Utility for waiting for the next `conversation.item.appended` event to be triggered by the server
     * @returns {Promise<{item: ItemType}>}
     */
    async waitForNextItem() {
      const event = await this.waitForNext("conversation.item.appended");
      const { item } = event;
      return { item };
    }
    /**
     * Utility for waiting for the next `conversation.item.completed` event to be triggered by the server
     * @returns {Promise<{item: ItemType}>}
     */
    async waitForNextCompletedItem() {
      const event = await this.waitForNext("conversation.item.completed");
      const { item } = event;
      return { item };
    }
  };
})();
