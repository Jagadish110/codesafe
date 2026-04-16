/* ═══════════════════════════════════════════════════
   USAGETRACKER.JS — Token Usage Tracking
   ═══════════════════════════════════════════════════
   
   This script tracks input and output tokens for 
   AI API calls to help monitor costs and limits.
   Results are persisted in localStorage.
═══════════════════════════════════════════════════ */

const UsageTracker = {
    totalInput: 0,
    totalOutput: 0,
    history: [],

    track(provider, model, input, output) {
        this.totalInput += (input || 0);
        this.totalOutput += (output || 0);
        
        const entry = {
            timestamp: new Date().toISOString(),
            provider,
            model,
            input: input || 0,
            output: output || 0,
            total: (input || 0) + (output || 0)
        };
        
        this.history.push(entry);
        
        // Keep history size reasonable
        if (this.history.length > 100) {
            this.history.shift();
        }

        console.log(`%c[UsageTracker] ${provider} (${model})`, 'color: #0d9488; font-weight: bold;', {
            input: input,
            output: output,
            total: entry.total,
            grandTotal: this.totalInput + this.totalOutput
        });
        
        this.save();
        
        // Dispatch global event for UI updates
        window.dispatchEvent(new CustomEvent('codesafe:usage_updated', { 
            detail: { 
                lastEntry: entry,
                stats: this.getStats()
            } 
        }));
    },

    save() {
        try {
            localStorage.setItem('codesafe_usage_stats', JSON.stringify({
                totalInput: this.totalInput,
                totalOutput: this.totalOutput,
                history: this.history
            }));
        } catch (e) {
            console.warn('UsageTracker: Could not save to localStorage', e);
        }
    },

    load() {
        try {
            const saved = localStorage.getItem('codesafe_usage_stats');
            if (saved) {
                const data = JSON.parse(saved);
                this.totalInput = data.totalInput || 0;
                this.totalOutput = data.totalOutput || 0;
                this.history = data.history || [];
            }
        } catch (e) {
            console.warn('UsageTracker: Could not load from localStorage', e);
        }
    },

    getStats() {
        return {
            input: this.totalInput,
            output: this.totalOutput,
            total: this.totalInput + this.totalOutput,
            history: this.history
        };
    },

    printReport() {
        console.group('%c📊 CodeSafe Token Usage Report', 'color: #0d9488; font-size: 14px; font-weight: bold;');
        console.log(`Total Input Tokens:  %c${this.totalInput.toLocaleString()}`, 'color: #2563eb; font-weight: bold;');
        console.log(`Total Output Tokens: %c${this.totalOutput.toLocaleString()}`, 'color: #9333ea; font-weight: bold;');
        console.log(`Grand Total Tokens:  %c${(this.totalInput + this.totalOutput).toLocaleString()}`, 'color: #0f172a; font-weight: bold;');
        
        if (this.history.length > 0) {
            console.group('Recent History');
            console.table(this.history.slice(-10).map(h => ({
                Time: new Date(h.timestamp).toLocaleTimeString(),
                Provider: h.provider,
                Model: h.model,
                Input: h.input.toLocaleString(),
                Output: h.output.toLocaleString(),
                Total: h.total.toLocaleString()
            })));
            console.groupEnd();
        }
        console.groupEnd();
    },

    reset() {
        this.totalInput = 0;
        this.totalOutput = 0;
        this.history = [];
        this.save();
        console.log('[UsageTracker] Statistics reset.');
    }
};

// Auto-load on script start
UsageTracker.load();

// Export for environment compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UsageTracker;
}
window.UsageTracker = UsageTracker;
