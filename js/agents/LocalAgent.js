(function (root, factory) {
  const LocalAgentClass = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = LocalAgentClass;
  } else {
    root.LocalAgent = LocalAgentClass;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return class LocalAgent {
    constructor({ timeout = 60000 } = {}) {
      this.timeout = timeout;
    }

    // Kept for interface compatibility with cloud agents. Local inference runs
    // in the DevTools panel document because LanguageModel is not exposed in
    // the Manifest V3 service worker.
    setBackgroundPort() {}

    setPortConnected() {}

    async sendMessage(systemPrompt, messages) {
      if (!('LanguageModel' in globalThis)) {
        throw new Error('Chrome built-in AI is not available in this browser');
      }

      const availability = await globalThis.LanguageModel.availability();
      if (availability === 'unavailable') {
        throw new Error('Chrome built-in AI is unavailable on this device');
      }

      const promptMessages = (messages || [])
        .filter((message) => (
          (message.role === 'user' || message.role === 'assistant') &&
          typeof message.content === 'string'
        ))
        .map((message) => ({
          role: message.role,
          content: message.content
        }));
      const lastMessage = promptMessages[promptMessages.length - 1];

      if (!lastMessage || lastMessage.role !== 'user') {
        throw new Error('No user message to send');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      let session;

      try {
        session = await globalThis.LanguageModel.create({
          initialPrompts: [
            { role: 'system', content: systemPrompt },
            ...promptMessages.slice(0, -1)
          ],
          monitor(monitor) {
            monitor.addEventListener('downloadprogress', (event) => {
              const progress = Math.round(event.loaded * 100);
              console.info(`[Chrome Code] Chrome AI download: ${progress}%`);
            });
          },
          signal: controller.signal
        });

        return await session.prompt(lastMessage.content, {
          signal: controller.signal
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error('Request timeout');
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
        try {
          session?.destroy();
        } catch (cleanupError) {
          console.warn('[Chrome Code] Unable to destroy LanguageModel session', cleanupError);
        }
      }
    }
  };
}));
