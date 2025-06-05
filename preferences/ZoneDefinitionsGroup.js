// ./preferences/ZoneDefinitionsGroup.js
import Adw from 'gi://Adw'; 
import Gtk from 'gi://Gtk'; 
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; 
import { ZoneEditorGrid } from './ZoneEditorGrid.js'; // Assuming ZoneEditorGrid.js is in the same directory

const ZONE_SETTINGS_KEY = 'zones'; 
const log = msg => console.log(`[TabbedTilingPrefs.ZoneDefs] ${msg}`); 

export class ZoneDefinitionsGroup {
    constructor(settings, monitorCount, window) {
        this._settings = settings;
        this._monitorCount = monitorCount;
        this._window = window; // Reference to the main preferences window for dialogs

        this.group = new Adw.PreferencesGroup({ 
            title: _('Zone Definitions'), 
            description: _('Define screen areas where windows will tile automatically. Use work area coordinates (excluding panels and docks).') 
        });

        // Add usage instructions
        this._addUsageInstructions();

        this._addButtonRow = new Adw.ActionRow(); 
        const addButton = new Gtk.Button({ 
            label: _('Add New Zone'), 
            halign: Gtk.Align.CENTER, 
            css_classes: ['suggested-action'] 
        });
        addButton.connect('clicked', () => this._addZone()); 
        this._addButtonRow.set_child(addButton); 

        this._loadZonesToUI();
    }

    _addUsageInstructions() {
		const instructionsRow = new Adw.ActionRow({
		    title: _('Zone Definition Tips'),
		    subtitle: _('Click to view detailed instructions for defining zones')
		});

		const helpButton = new Gtk.Button({
		    icon_name: 'help-browser-symbolic',
		    valign: Gtk.Align.CENTER,
		    tooltip_text: _('Show zone definition help'),
		    css_classes: ['flat', 'circular']
		});

		helpButton.connect('clicked', () => {
		    const helpText = "Zone coordinates are relative to the full monitor geometry.\n\n" +
		        "Key Points:\n" +
		        "• X, Y: Position from top-left of monitor (including panels)\n" +
		        "• Width, Height: Zone dimensions in pixels\n" +
		        "• Monitor Index: 0 = primary monitor, 1 = secondary, etc.\n" +
		        "• Use gaps setting for spacing between zones\n\n" +
		        "Example for 1920x1080 screen:\n" +
		        "• Full monitor: 1920 x 1080 pixels\n" +
		        "• Left half zone: X=0, Y=0, W=960, H=1080\n" +
		        "• Right half zone: X=960, Y=0, W=960, H=1080\n\n" +
		        "Note: Zones should account for panels/docks in their positioning.\n" +
		        "Tip: Test your zones by dragging windows after defining them.";
		    
		    const dialog = new Adw.MessageDialog({
		        heading: _("Zone Definition Guide"),
		        body: helpText,
		        transient_for: this._window.get_root(),
		        modal: true
		    });
		    dialog.add_response("ok", _("Got it"));
		    dialog.set_response_appearance("ok", Adw.ResponseAppearance.SUGGESTED);
		    dialog.connect("response", (d) => d.destroy());
		    dialog.present();
		});

		instructionsRow.add_suffix(helpButton);
		this.group.add(instructionsRow);
	}

    getWidget() {
        return this.group;
    }

    _loadZonesToUI() {
        // Clear previous expanders except the add button row
        let child = this.group.get_first_child(); 
        while (child) { 
            const next = child.get_next_sibling(); 
            if (child !== this._addButtonRow && child instanceof Adw.ExpanderRow) { 
                 this.group.remove(child); 
            }
            child = next; 
        }
        // Ensure add button row is removed if it exists, to re-add it at the end
        if (this._addButtonRow.get_parent() === this.group) { 
            this.group.remove(this._addButtonRow); 
        }

        let zones = []; 
        try {
            zones = JSON.parse(this._settings.get_string(ZONE_SETTINGS_KEY)); 
            if (!Array.isArray(zones)) zones = []; 
        } catch (e) {
            log(`Error parsing zones JSON: ${e}`); 
            zones = []; 
        }

        zones.forEach(zoneData => this._createAndAddZoneExpander(zoneData)); 
        
        this.group.add(this._addButtonRow); // Re-add the add button row
    }

    _createAndAddZoneExpander(zoneData) {
        const editorGrid = new ZoneEditorGrid(zoneData, this._monitorCount);
        const expanderRow = new Adw.ExpanderRow({
            title: zoneData.name || _('Unnamed Zone'),
            subtitle: `X:${zoneData.x}, Y:${zoneData.y}, W:${zoneData.width}, H:${zoneData.height}, M:${zoneData.monitorIndex + 1}`
        });
        expanderRow.add_row(editorGrid);

        const removeButton = new Gtk.Button({
            icon_name: 'edit-delete-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: _("Remove this zone"),
            css_classes: ['flat', 'circular']
        });
        expanderRow.add_suffix(removeButton);
        expanderRow.set_enable_expansion(true);

        editorGrid.connect('changed', () => {
            const cd = editorGrid.get_zone_data();
            expanderRow.title    = cd.name || _('Unnamed Zone');
            expanderRow.subtitle = `X:${cd.x}, Y:${cd.y}, W:${cd.width}, H:${cd.height}, M:${cd.monitorIndex + 1}`;
            this._saveZones();
        });
        removeButton.connect('clicked', () => {
            const dialog = new Adw.MessageDialog({
                heading: _("Remove Zone?"),
                body: _("Are you sure you want to remove this zone?"),
                transient_for: this._window.get_root(),
                modal: true
            });
            dialog.add_response("cancel", _("Cancel"));
            dialog.add_response("remove", _("Remove"));
            dialog.set_response_appearance("remove", Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.connect("response", (d, resp) => {
                if (resp === "remove") {
                    this.group.remove(expanderRow);
                    this._saveZones();
                }
                d.destroy();
            });
            dialog.present();
        });
        
        // Add the new expander row. Ordering is handled by _loadZonesToUI
        // (which removes _addButtonRow and adds it back after all zones).
        this.group.add(expanderRow);
    }

    _addZone() {
        let current = []; 
        try {
            current = JSON.parse(this._settings.get_string(ZONE_SETTINGS_KEY)) || []; 
        } catch (e) {
            // Handle parsing error
        }
        const idx = current.length + 1; 
        const newZone = { 
            monitorIndex: 0, // Default to first monitor
            name:         _('New Zone %d').format(idx), 
            x: 0, y: 0, width: 600, height: 400 // Some default size
        };
        this._createAndAddZoneExpander(newZone); 
        this._saveZones(); 
    }

    _saveZones() {
        const zones = []; 
        let child = this.group.get_first_child(); 
        while (child) { 
            if (child instanceof Adw.ExpanderRow && child.get_n_rows() > 0) { 
                const firstRowContent = child.get_row_at_index(0); 
                if (firstRowContent instanceof ZoneEditorGrid) { 
                    zones.push(firstRowContent.get_zone_data()); 
                } else {
                    log('Warning: Could not find ZoneEditorGrid in ExpanderRow to save zone data.'); 
                }
            }
            child = child.get_next_sibling(); 
        }
        this._settings.set_string(ZONE_SETTINGS_KEY, JSON.stringify(zones)); 
        log(`Saved ${zones.length} zones.`); 
    }
}
