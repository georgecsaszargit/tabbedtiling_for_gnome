import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { SettingsManager } from './modules/SettingsManager.js';
import { HighlightManager } from './modules/HighlightManager.js';
import { WindowManager } from './modules/WindowManager.js';
import { Indicator } from './modules/Indicator.js';

const log = (msg) => console.log(`[AutoZoner.Main] ${msg}`);
const ENABLE_ZONING_KEY = 'enable-auto-zoning';

export default class AutoZonerExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settingsManager = null;
        this._highlightManager = null;
        this._windowManager = null;
        this._indicator = null;
        this._monitorsChangedSignalId = 0;
        this._zoningEnabledChangedSignalId = 0;
    }

    enable() {
        log('Enabling Auto Zoner Extension...');
        try {
            this._settingsManager = new SettingsManager(this.getSettings(), this.path);
            this._highlightManager = new HighlightManager(this._settingsManager);
            this._windowManager = new WindowManager(this._settingsManager, this._highlightManager);
            this._indicator = new Indicator(this.uuid, this._settingsManager, this);

            this._windowManager.connectSignals();

            this._zoningEnabledChangedSignalId = this._settingsManager.connect(ENABLE_ZONING_KEY, () => {
                log("Zoning enabled setting changed, updating WindowManager signals and Indicator.");
                this._windowManager.connectSignals();
                if (this._indicator) this._indicator.updateToggleState();
            });

            if (Main.layoutManager) {
                 this._monitorsChangedSignalId = Main.layoutManager.connect('monitors-changed', () => {
                    log('Monitors changed, re-initializing highlighters.');
                    if (this._highlightManager) this._highlightManager.reinitHighlighters();
                });
            }

            log('Auto Zoner Extension Enabled.');
        } catch (e) {
            log(`Error during enable: ${e}\n${e.stack}`);
            this.disable(); // Attempt cleanup
        }
    }

    disable() {
        log('Disabling Auto Zoner Extension...');

        if (this._monitorsChangedSignalId > 0 && Main.layoutManager) {
            try {
                if(Main.layoutManager.is_connected && Main.layoutManager.is_connected(this._monitorsChangedSignalId)) { // Check for is_connected
                    Main.layoutManager.disconnect(this._monitorsChangedSignalId);
                } else if (Main.layoutManager.disconnect) { // Fallback
                     Main.layoutManager.disconnect(this._monitorsChangedSignalId);
                }
            } catch(e) { log(`Error disconnecting monitors-changed: ${e}`);}
            this._monitorsChangedSignalId = 0;
        }

        if (this._zoningEnabledChangedSignalId > 0 && this._settingsManager) {
             try {
                const gsettingsObj = this._settingsManager.getGSettingObject();
                // Similar robust check for gsettings object
                if(gsettingsObj.is_connected && gsettingsObj.is_connected(this._zoningEnabledChangedSignalId)) {
                    gsettingsObj.disconnect(this._zoningEnabledChangedSignalId);
                } else if (gsettingsObj.disconnect) {
                    gsettingsObj.disconnect(this._zoningEnabledChangedSignalId);
                }
            } catch(e) { log(`Error disconnecting zoning-enabled: ${e}`);}
            this._zoningEnabledChangedSignalId = 0;
        }


        if (this._windowManager) {
            // cleanupWindowProperties is already called within WindowManager's destroy if needed
            // but calling it here ensures it happens even if WM.destroy() had an issue.
            this._windowManager.cleanupWindowProperties();
            this._windowManager.destroy();
            this._windowManager = null;
        }
        if (this._highlightManager) {
            this._highlightManager.destroy();
            this._highlightManager = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._settingsManager) {
            this._settingsManager.destroy();
            this._settingsManager = null;
        }
        log('Auto Zoner Extension Disabled.');
    }
}
