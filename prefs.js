// prefs.js
import Adw from 'gi://Adw'; 
import Gdk from 'gi://Gdk'; 
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; 

// Import new preference group modules
import { createGeneralSettingsGroup } from './preferences/GeneralSettingsGroup.js';
import { createTabBarSettingsGroup } from './preferences/TabBarSettingsGroup.js';
import { ZoneDefinitionsGroup } from './preferences/ZoneDefinitionsGroup.js';

const SNAP_EVASION_KEY = 'snap-evasion-key'; 
const log = msg => console.log(`[AutoZonerPrefs] ${msg}`); 


export default class AutoZonerPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this._settings = this.getSettings(); 
        this._window = window; 
        this._evasionKeySignalId = 0;

        const display = Gdk.Display.get_default(); 
        const monitorCount = display?.get_monitors().get_n_items() || 1; 
        
        const page = new Adw.PreferencesPage(); 
        window.add(page); 

        // General Settings Group
        const { group: generalGroup, evasionKeySettingChangedId } = createGeneralSettingsGroup(this._settings); 
        page.add(generalGroup);
        this._evasionKeySignalId = evasionKeySettingChangedId;


        // Tab Bar Adjustments Group
        const tabBarGroup = createTabBarSettingsGroup(this._settings); 
        page.add(tabBarGroup);

        // Zone Definitions Group
        this._zoneDefinitionsManager = new ZoneDefinitionsGroup(this._settings, monitorCount, window);
        page.add(this._zoneDefinitionsManager.getWidget());


        // Disconnect the signal when the preferences window is destroyed
        if (window && typeof window.connect === 'function') { 
            window.connect('close-request', () => { // Or 'destroy' 
                if (this._settings && this._evasionKeySignalId > 0) { 
                    try {
                        this._settings.disconnect(this._evasionKeySignalId); 
                        this._evasionKeySignalId = 0;
                    } catch (e) {
                        log(`Error disconnecting evasionKeySettingChangedId: ${e}`); 
                    }
                }
            });
        }
    }
}
