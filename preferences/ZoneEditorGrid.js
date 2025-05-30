// ./preferences/ZoneEditorGrid.js
import Gtk from 'gi://Gtk'; 
import GObject from 'gi://GObject'; 
import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'; 

export const ZoneEditorGrid = GObject.registerClass({
    Signals: { 'changed': {} }
}, class ZoneEditorGrid extends Gtk.Grid {
    _init(zoneData, monitorCount) {
        super._init({
            column_spacing: 12, 
            row_spacing: 6, 
            margin_top: 10, 
            margin_bottom: 10, 
            margin_start: 10, 
            margin_end: 10, 
            hexpand: true, 
        });
        
        this._zone = { ...zoneData }; 
        
        this.attach(new Gtk.Label({ label: _('Name:'), halign: Gtk.Align.END }), 0, 0, 1, 1); 
        this._nameEntry = new Gtk.Entry({ text: this._zone.name || '', hexpand: true }); 
        this._nameEntry.connect('changed', () => { 
            this._zone.name = this._nameEntry.get_text(); 
            this.emit('changed'); 
        });
        this.attach(this._nameEntry, 1, 0, 3, 1); 

        this.attach(new Gtk.Label({ label: _('Monitor Index:'), halign: Gtk.Align.END }), 0, 1, 1, 1); 
        this._monitorSpin = Gtk.SpinButton.new_with_range(0, Math.max(0, monitorCount - 1), 1); 
        this._monitorSpin.set_value(this._zone.monitorIndex || 0); 
        this._monitorSpin.connect('value-changed', () => { 
            this._zone.monitorIndex = this._monitorSpin.get_value_as_int(); 
            this.emit('changed'); 
        });
        this.attach(this._monitorSpin, 1, 1, 1, 1); 

        const fields = [ 
            { label: _('X:'), key: 'x' }, { label: _('Y:'), key: 'y' }, 
            { label: _('Width:'), key: 'width' }, { label: _('Height:'), key: 'height' } 
        ];
        fields.forEach((f, i) => { 
            const row = Math.floor(i / 2) + 2; 
            const col = (i % 2) * 2; 
            this.attach(new Gtk.Label({ label: f.label, halign: Gtk.Align.END }), col, row, 1, 1); 
            const spin = Gtk.SpinButton.new_with_range(0, 10000, 10); 
            spin.set_value(this._zone[f.key] || 0); 
            spin.set_hexpand(true); 
            spin.connect('value-changed', () => { 
                this._zone[f.key] = spin.get_value_as_int(); 
                this.emit('changed'); 
            });
            this.attach(spin, col + 1, row, 1, 1); 
        });
    }

    get_zone_data() {
        return { ...this._zone }; 
    }
});
