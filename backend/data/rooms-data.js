// ============================================================
// MEETING ROOMS & DESK BOOKING DATA
// 15 meeting rooms, 60 hot desks across 5 floors
// Includes AV equipment, capacity, zones
// ============================================================

// ─── Meeting Rooms ──────────────────────────────────────────
const meetingRooms = [
  { id: 'rm-01', name: 'Everest',       floor: 2, capacity: 4,  hasAV: true,  hasWhiteboard: true,  hasVideoConf: true,  status: 'available', amenities: ['projector', 'webcam', 'whiteboard', 'speakers'] },
  { id: 'rm-02', name: 'K2',            floor: 2, capacity: 8,  hasAV: true,  hasWhiteboard: true,  hasVideoConf: true,  status: 'available', amenities: ['dual-screen', 'webcam', 'whiteboard', 'speakerphone'] },
  { id: 'rm-03', name: 'Kanchenjunga',  floor: 2, capacity: 12, hasAV: true,  hasWhiteboard: true,  hasVideoConf: true,  status: 'available', amenities: ['projector', 'dual-webcam', 'whiteboard', 'recording'] },
  { id: 'rm-04', name: 'Nanda Devi',    floor: 3, capacity: 4,  hasAV: false, hasWhiteboard: true,  hasVideoConf: false, status: 'available', amenities: ['whiteboard'] },
  { id: 'rm-05', name: 'Annapurna',     floor: 3, capacity: 6,  hasAV: true,  hasWhiteboard: true,  hasVideoConf: true,  status: 'available', amenities: ['TV-screen', 'webcam', 'whiteboard'] },
  { id: 'rm-06', name: 'Dhaulagiri',    floor: 3, capacity: 10, hasAV: true,  hasWhiteboard: true,  hasVideoConf: true,  status: 'available', amenities: ['projector', 'webcam', 'recording', 'whiteboard'] },
  { id: 'rm-07', name: 'Makalu',        floor: 3, capacity: 20, hasAV: true,  hasWhiteboard: true,  hasVideoConf: true,  status: 'available', amenities: ['dual-projector', 'multi-cam', 'PA-system', 'recording', 'whiteboard'] },
  { id: 'rm-08', name: 'Lhotse',        floor: 4, capacity: 4,  hasAV: true,  hasWhiteboard: false, hasVideoConf: true,  status: 'available', amenities: ['TV-screen', 'webcam'] },
  { id: 'rm-09', name: 'Cho Oyu',       floor: 4, capacity: 6,  hasAV: true,  hasWhiteboard: true,  hasVideoConf: true,  status: 'available', amenities: ['TV-screen', 'webcam', 'whiteboard'] },
  { id: 'rm-10', name: 'Manaslu',       floor: 4, capacity: 8,  hasAV: true,  hasWhiteboard: true,  hasVideoConf: true,  status: 'available', amenities: ['projector', 'webcam', 'whiteboard', 'speakerphone'] },
  { id: 'rm-11', name: 'Shishapangma',  floor: 4, capacity: 14, hasAV: true,  hasWhiteboard: true,  hasVideoConf: true,  status: 'available', amenities: ['projector', 'dual-webcam', 'whiteboard', 'recording'] },
  { id: 'rm-12', name: 'Boardroom',     floor: 10,capacity: 24, hasAV: true,  hasWhiteboard: true,  hasVideoConf: true,  status: 'available', amenities: ['4K-display', 'multi-cam', 'PA-system', 'recording', 'catering-service'] },
  { id: 'rm-13', name: 'Huddle A',      floor: 2, capacity: 3,  hasAV: false, hasWhiteboard: false, hasVideoConf: false, status: 'available', amenities: ['standing-table'] },
  { id: 'rm-14', name: 'Huddle B',      floor: 3, capacity: 3,  hasAV: false, hasWhiteboard: false, hasVideoConf: false, status: 'available', amenities: ['standing-table'] },
  { id: 'rm-15', name: 'Training Lab',  floor: 5, capacity: 30, hasAV: true,  hasWhiteboard: true,  hasVideoConf: true,  status: 'available', amenities: ['projector', 'individual-screens', 'PA-system', 'recording', 'whiteboard'] },
];

// ─── Room Bookings (in-memory) ──────────────────────────────
const roomBookings = [
  // Seed some existing bookings
  { id: 'rb-001', room_id: 'rm-01', booked_by: 'u1', booked_by_name: 'Tanya Mehra',   date: _todayStr(), start_time: '10:00', end_time: '11:00', title: 'Sprint Planning',      status: 'confirmed', checked_in: false },
  { id: 'rb-002', room_id: 'rm-03', booked_by: 'u2', booked_by_name: 'Ananya Iyer',    date: _todayStr(), start_time: '14:00', end_time: '15:30', title: 'Design Review',         status: 'confirmed', checked_in: true },
  { id: 'rb-003', room_id: 'rm-07', booked_by: 'u3', booked_by_name: 'Rohan Verma',    date: _todayStr(), start_time: '09:00', end_time: '10:30', title: 'All-Hands Meeting',     status: 'confirmed', checked_in: true },
  { id: 'rb-004', room_id: 'rm-12', booked_by: 'u5', booked_by_name: 'Aditya Nair',    date: _tomorrowStr(), start_time: '11:00', end_time: '12:00', title: 'Board Prep', status: 'confirmed', checked_in: false },
];

// ─── Hot Desks ──────────────────────────────────────────────
const hotDesks = [];
const zones = ['quiet', 'collaboration', 'standard'];
const floors = [2, 3, 4, 5];
let deskCounter = 1;
floors.forEach(floor => {
  zones.forEach(zone => {
    const count = zone === 'standard' ? 5 : 3;
    for (let i = 0; i < count; i++) {
      hotDesks.push({
        id: `desk-${String(deskCounter).padStart(3, '0')}`,
        floor,
        zone,
        label: `${floor}${zone[0].toUpperCase()}${i + 1}`,
        has_monitor: zone !== 'collaboration',
        has_docking_station: zone === 'standard',
        has_standing_option: zone === 'collaboration' || i === 0,
        near_window: i < 2,
        status: 'available',
      });
      deskCounter++;
    }
  });
});

// ─── Desk Bookings ──────────────────────────────────────────
const deskBookings = [
  { id: 'db-001', desk_id: 'desk-001', booked_by: 'u1', booked_by_name: 'Naveen Kulkarni',  date: _todayStr(), checked_in: true,  check_in_time: '09:15' },
  { id: 'db-002', desk_id: 'desk-005', booked_by: 'u3', booked_by_name: 'Rohan Verma',   date: _todayStr(), checked_in: false, check_in_time: null },
  { id: 'db-003', desk_id: 'desk-012', booked_by: 'u4', booked_by_name: 'Sneha Patel',   date: _tomorrowStr(), checked_in: false, check_in_time: null },
];

// ─── Helpers ────────────────────────────────────────────────
function _todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function _tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function findAvailableRooms(date, startTime, endTime, minCapacity = 1) {
  return meetingRooms.filter(room => {
    if (room.capacity < minCapacity) return false;
    // Check for conflicts
    const conflicts = roomBookings.filter(b =>
      b.room_id === room.id && b.date === date && b.status !== 'cancelled' &&
      !(endTime <= b.start_time || startTime >= b.end_time)
    );
    return conflicts.length === 0;
  });
}

function findAvailableDesks(date, floor = null, zone = null) {
  const bookedDeskIds = deskBookings
    .filter(b => b.date === date)
    .map(b => b.desk_id);
  return hotDesks.filter(desk => {
    if (bookedDeskIds.includes(desk.id)) return false;
    if (floor && desk.floor !== floor) return false;
    if (zone && desk.zone !== zone) return false;
    return true;
  });
}

module.exports = {
  meetingRooms, roomBookings,
  hotDesks, deskBookings,
  findAvailableRooms, findAvailableDesks,
};
