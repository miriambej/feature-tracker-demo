(() => {
  const NativeFileReader = window.FileReader;

  function shouldPreserveExportedStage(file) {
    const name = String(file?.name || '').toLowerCase();
    return name.endsWith('.json') && (name.includes('planning') || name.includes('kanban'));
  }

  function rewritePlanningJson(text) {
    try {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.allocations)) return text;
      let changed = 0;
      data.allocations = data.allocations.map((allocation) => {
        const exportedStage = String(allocation?.stage || '').trim();
        const sourceStage = String(allocation?.sourceStage || '').trim();
        if (!exportedStage || !sourceStage || exportedStage === sourceStage) return allocation;
        changed += 1;
        return {
          ...allocation,
          sourceStageOriginal: allocation.sourceStageOriginal || allocation.sourceStage,
          sourceStage: allocation.stage,
        };
      });
      if (changed) {
        data.importPortability = {
          ...(data.importPortability || {}),
          preservedExportedStage: true,
          adjustedAllocationCount: changed,
        };
      }
      return JSON.stringify(data);
    } catch {
      return text;
    }
  }

  class PortabilityFileReader extends NativeFileReader {
    readAsText(file, encoding) {
      if (!shouldPreserveExportedStage(file)) {
        return super.readAsText(file, encoding);
      }
      const originalOnload = this.onload;
      this.onload = (event) => {
        try {
          const rewritten = rewritePlanningJson(String(this.result || ''));
          Object.defineProperty(this, 'result', {
            configurable: true,
            value: rewritten,
          });
          if (event?.target) {
            try {
              Object.defineProperty(event.target, 'result', {
                configurable: true,
                value: rewritten,
              });
            } catch {}
          }
        } catch {}
        if (typeof originalOnload === 'function') return originalOnload.call(this, event);
      };
      return super.readAsText(file, encoding);
    }
  }

  window.FileReader = PortabilityFileReader;
})();
