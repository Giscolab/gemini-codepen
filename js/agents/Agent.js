(function (root, factory) {
  const AgentClass = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = AgentClass;
  } else {
    root.Agent = AgentClass;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  let requestSequence = 0;

  function createRequestId() {
    requestSequence += 1;

    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return `agent-${globalThis.crypto.randomUUID()}`;
    }

    return `agent-${Date.now()}-${requestSequence}`;
  }

  return class Agent {
    constructor(config) {
      this.apiKey = config.apiKey;
      this.responseType = config.responseType;
      this.callType = config.callType;
      this.timeout = config.timeout || 30000;
      this.backgroundPort = null;
      this.isPortConnected = false;
    }

    setBackgroundPort(port) {
      this.backgroundPort = port;
      this.isPortConnected = true;
    }

    setPortConnected(connected) {
      this.isPortConnected = connected;
    }

    async sendMessage(systemPrompt, messages) {
      if (!this.backgroundPort || !this.isPortConnected) {
        throw new Error('Not connected to background script');
      }

      const port = this.backgroundPort;
      const requestId = createRequestId();

      return new Promise((resolve, reject) => {
        let settled = false;
        let timeoutId;

        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          port.onMessage.removeListener(responseHandler);
          if (port.onDisconnect?.removeListener) {
            port.onDisconnect.removeListener(disconnectHandler);
          }
        };

        const settle = (callback, value) => {
          if (settled) return;
          settled = true;
          cleanup();
          callback(value);
        };

        const responseHandler = (message) => {
          if (!message || message.requestId !== requestId) return;

          if (message.type === this.responseType) {
            settle(resolve, message.response);
          } else if (message.type === 'ERROR') {
            settle(reject, new Error(message.error || 'Background request failed'));
          }
        };

        const disconnectHandler = () => {
          this.isPortConnected = false;
          settle(reject, new Error('Connection lost. Please try again.'));
        };

        port.onMessage.addListener(responseHandler);
        if (port.onDisconnect?.addListener) {
          port.onDisconnect.addListener(disconnectHandler);
        }

        timeoutId = setTimeout(() => {
          settle(reject, new Error('Request timeout'));
        }, this.timeout);

        try {
          const messageData = {
            type: this.callType,
            requestId,
            systemPrompt,
            messages
          };

          if (this.apiKey !== undefined) {
            messageData.apiKey = this.apiKey;
          }

          if (this.model) {
            messageData.model = this.model;
          }

          port.postMessage(messageData);
        } catch (error) {
          this.isPortConnected = false;
          const isDisconnected = error.message?.includes('disconnected port');
          const message = isDisconnected
            ? 'Connection lost. Please try again.'
            : `Failed to send message: ${error.message}`;
          settle(reject, new Error(message));
        }
      });
    }
  };
}));
