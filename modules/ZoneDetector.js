import * as Main from 'resource:///org/gnome/shell/ui/main.js'; // [cite: 481]
const log = (prefix, msg) => console.log(`[AutoZoner.ZoneDetector.${prefix}] ${msg}`); // [cite: 481]

function isPointInsideRect(point, rect) {
    const check = point.x >= rect.x && point.x <= rect.x + rect.width && // [cite: 481]
                  point.y >= rect.y && point.y <= rect.y + rect.height; // [cite: 481]
    // log('isPointInsideRect', `Point: ${JSON.stringify(point)}, Rect: ${JSON.stringify(rect)}, Result: ${check}`); // [cite: 482]
    return check; // [cite: 482]
}

function getMonitorWorkArea(monitorIndex) {
    if (monitorIndex < 0 || monitorIndex >= Main.layoutManager.monitors.length) { // [cite: 483]
        const primaryIndex = Main.layoutManager.primaryIndex; // [cite: 483]
        // log('getMonitorWorkArea', `Invalid index ${monitorIndex}, using primary ${primaryIndex}`); // [cite: 484]
        return Main.layoutManager.getWorkAreaForMonitor(primaryIndex); // [cite: 484]
    }
    // log('getMonitorWorkArea', `Using index ${monitorIndex}`); // [cite: 484]
    return Main.layoutManager.getWorkAreaForMonitor(monitorIndex); // [cite: 485]
}

export class ZoneDetector {
    constructor() {
        // log('constructor', 'Initialized'); // [cite: 485]
    }

    findTargetZone(activeZones, point, monitorIndex) { // Takes activeZones directly // [cite: 486]
        const workArea = getMonitorWorkArea(monitorIndex); // [cite: 486]
        log('findTargetZone', `Searching on monitor ${monitorIndex} (WorkArea: X:${workArea.x} Y:${workArea.y} W:${workArea.width} H:${workArea.height}) for point X:${point.x} Y:${point.y}`); // [cite: 487]
        log('findTargetZone', `Available zones for this search: ${JSON.stringify(activeZones.filter(z => z.monitorIndex === monitorIndex))}`); // [cite: 488]
        for (const zone of activeZones) { // [cite: 489]
            if (zone.monitorIndex === monitorIndex) { // [cite: 489]
                const absoluteZoneRect = { // [cite: 489]
                    x: workArea.x + zone.x, // [cite: 489]
                    y: workArea.y + zone.y, // [cite: 489]
                    width: zone.width, // [cite: 490]
                    height: zone.height // [cite: 490]
                };
                log('findTargetZone', `Checking zone "${zone.name || 'Unnamed'}": AbsRect: X:${absoluteZoneRect.x} Y:${absoluteZoneRect.y} W:${absoluteZoneRect.width} H:${absoluteZoneRect.height}`); // [cite: 491]
                if (isPointInsideRect(point, absoluteZoneRect)) { // [cite: 492]
                    log('findTargetZone', `Point IS INSIDE zone "${zone.name || 'Unnamed'}"`); // [cite: 492]
                    return zone; // [cite: 493]
                } else { // [cite: 493]
                    // log('findTargetZone', `Point is NOT inside zone "${zone.name || 'Unnamed'}"`); // [cite: 493]
                }
            }
        }
        log('findTargetZone', `No target zone found for point X:${point.x} Y:${point.y} on monitor ${monitorIndex}`); // [cite: 494]
        return null; // [cite: 495]
    }
}
