// prefs.js
import Adw from 'gi://Adw'; // [cite: 511]
import Gdk from 'gi://Gdk'; // [cite: 512]
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; // [cite: 513]

// Import new preference group modules
import { createGeneralSettingsGroup } from './preferences/GeneralSettingsGroup.js';
import { createTabBarSettingsGroup } from './preferences/TabBarSettingsGroup.js';
import { ZoneDefinitionsGroup } from './preferences/ZoneDefinitionsGroup.js';

const SNAP_EVASION_KEY = 'snap-evasion-key'; // [cite: 530]
const log = msg => console.log(`[AutoZonerPrefs] ${msg}`); // [cite: 531]


export default class AutoZonerPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings(); // [cite: 544]
        this._window = window; // [cite: 545]
        this._evasionKeySignalId = 0;

        const display = Gdk.Display.get_default(); // [cite: 545]
        // CORRECTED LINE:
        const monitorCount = display?.get_monitors().get_n_items() || 1; // [cite: 545]
        
        const page = new Adw.PreferencesPage(); // [cite: 546]
        window.add(page); // [cite: 547]

        // General Settings Group
        const { group: generalGroup, evasionKeySettingChangedId } = createGeneralSettingsGroup(this._settings); // [cite: 547]
        page.add(generalGroup);
        this._evasionKeySignalId = evasionKeySettingChangedId;


        // Tab Bar Adjustments Group
        const tabBarGroup = createTabBarSettingsGroup(this._settings); // [cite: 584]
        page.add(tabBarGroup);

        // Zone Definitions Group
        this._zoneDefinitionsManager = new ZoneDefinitionsGroup(this._settings, monitorCount, window);
        page.add(this._zoneDefinitionsManager.getWidget());


        // Disconnect the signal when the preferences window is destroyed
        if (window && typeof window.connect === 'function') { // [cite: 610]
            window.connect('close-request', () => { // Or 'destroy' // [cite: 610]
                if (this._settings && this._evasionKeySignalId > 0) { // [cite: 610]
                    try {
                        this._settings.disconnect(this._evasionKeySignalId); // [cite: 611]
                        this._evasionKeySignalId = 0;
                    } catch (e) {
                        log(`Error disconnecting evasionKeySettingChangedId: ${e}`); // [cite: 611]
                    }
                }
            });
        }
    }
}
