// ./preferences/ZoneDefinitionsGroup.js
import Adw from 'gi://Adw'; // [cite: 511]
import Gtk from 'gi://Gtk'; // [cite: 512]
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; // [cite: 513]
import { ZoneEditorGrid } from './ZoneEditorGrid.js'; // Assuming ZoneEditorGrid.js is in the same directory

const ZONE_SETTINGS_KEY = 'zones'; // [cite: 514]
const log = msg => console.log(`[AutoZonerPrefs.ZoneDefs] ${msg}`); // [cite: 531]

export class ZoneDefinitionsGroup {
    constructor(settings, monitorCount, window) {
        this._settings = settings;
        this._monitorCount = monitorCount;
        this._window = window; // Reference to the main preferences window for dialogs

        this.group = new Adw.PreferencesGroup({ // [cite: 608]
            title: _('Zone Definitions'), // [cite: 608]
            description: _('Define screen areas where windows will tile automatically.') // [cite: 608]
        });

        this._addButtonRow = new Adw.ActionRow(); // [cite: 609]
        const addButton = new Gtk.Button({ // [cite: 609]
            label: _('Add New Zone'), // [cite: 609]
            halign: Gtk.Align.CENTER, // [cite: 609]
            css_classes: ['suggested-action'] // [cite: 609]
        });
        addButton.connect('clicked', () => this._addZone()); // [cite: 610]
        this._addButtonRow.set_child(addButton); // [cite: 610]

        this._loadZonesToUI();
    }

    getWidget() {
        return this.group;
    }

    _loadZonesToUI() {
        // Clear previous expanders except the add button row
        let child = this.group.get_first_child(); // [cite: 615]
        while (child) { // [cite: 616]
            const next = child.get_next_sibling(); // [cite: 616]
            if (child !== this._addButtonRow && child instanceof Adw.ExpanderRow) { // [cite: 616, 617]
                 this.group.remove(child); // [cite: 617]
            }
            child = next; // [cite: 618]
        }
        // Ensure add button row is removed if it exists, to re-add it at the end
        if (this._addButtonRow.get_parent() === this.group) { // [cite: 619]
            this.group.remove(this._addButtonRow); // [cite: 619]
        }


        let zones = []; // [cite: 620]
        try {
            zones = JSON.parse(this._settings.get_string(ZONE_SETTINGS_KEY)); // [cite: 621]
            if (!Array.isArray(zones)) zones = []; // [cite: 622]
        } catch (e) {
            log(`Error parsing zones JSON: ${e}`); // [cite: 622]
            zones = []; // [cite: 623]
        }

        zones.forEach(zoneData => this._createAndAddZoneExpander(zoneData)); // [cite: 623]
        
        this.group.add(this._addButtonRow); // Re-add the add button row [cite: 624]
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
                body:    _("Are you sure you want to remove “%s”?").format(expanderRow.title),
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
                d.destroy(); // Make sure to destroy the dialog
            });
            dialog.present();
        });
        
        // CORRECTED LINE:
        // Add the new expander row. Ordering is handled by _loadZonesToUI
        // (which removes _addButtonRow and adds it back after all zones).
        this.group.add(expanderRow);
    }

    _addZone() {
        let current = []; // [cite: 634]
        try {
            current = JSON.parse(this._settings.get_string(ZONE_SETTINGS_KEY)) || []; // [cite: 635]
        } catch {} // [cite: 636]
        const idx = current.length + 1; // [cite: 636]
        const newZone = { // [cite: 637]
            monitorIndex: 0, // Default to first monitor [cite: 637]
            name:         _('New Zone %d').format(idx), // [cite: 637]
            x: 0, y: 0, width: 600, height: 400 // Some default size [cite: 637]
        };
        this._createAndAddZoneExpander(newZone); // [cite: 638]
        this._saveZones(); // [cite: 638]
    }

    _saveZones() {
        const zones = []; // [cite: 638]
        let child = this.group.get_first_child(); // [cite: 639]
        while (child) { // [cite: 639]
            if (child instanceof Adw.ExpanderRow && child.get_n_rows() > 0) { // [cite: 639]
                const firstRowContent = child.get_row_at_index(0); // [cite: 639]
                if (firstRowContent instanceof ZoneEditorGrid) { // [cite: 640]
                    zones.push(firstRowContent.get_zone_data()); // [cite: 640]
                } else {
                    log('Warning: Could not find ZoneEditorGrid in ExpanderRow to save zone data.'); // [cite: 643]
                }
            }
            child = child.get_next_sibling(); // [cite: 644]
        }
        this._settings.set_string(ZONE_SETTINGS_KEY, JSON.stringify(zones)); // [cite: 645]
        log(`Saved ${zones.length} zones.`); // [cite: 645]
    }
}
