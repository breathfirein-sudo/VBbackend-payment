const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// In-memory tracking of active pending dispatches (requestId -> timer & details)
const activeDispatches = new Map();

// Helper to check if an executive is clocked in today
const isExecClockedIn = (executive) => {
  if (!executive || !executive.attendance) return false;
  try {
    const logs = typeof executive.attendance === 'string' ? JSON.parse(executive.attendance) : executive.attendance;
    if (!Array.isArray(logs)) return false;
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayLog = logs.find(log => log.date === todayStr);
    return !!(todayLog && todayLog.clockIn && !todayLog.clockOut);
  } catch (err) {
    return false;
  }
};

// Helper to check if an executive is busy with an accepted active request or active prompt
const isExecBusy = async (execId) => {
  // Check active support sessions
  const activeSession = await prisma.supportSession.findFirst({
    where: { execId, status: 'Active' }
  });
  if (activeSession) return true;

  // Check connected call requests
  const connectedCall = await prisma.callRequest.findFirst({
    where: { execId, status: 'Connected' }
  });
  if (connectedCall) return true;

  // Check if executive currently has an active 30s pending prompt dispatch
  for (let [reqKey, dispatch] of activeDispatches.entries()) {
    if (dispatch.execId === execId) {
      return true;
    }
  }

  return false;
};

// Find available clocked-in executive for role type ('Chat' or 'Call')
const findAvailableExec = async (roleType, excludeExecIds = []) => {
  const candidates = await prisma.supportExecutive.findMany({
    where: {
      status: 'Active',
      role: { in: [roleType, 'Both'] },
      id: { notIn: excludeExecIds }
    }
  });

  const available = [];
  for (let exec of candidates) {
    if (isExecClockedIn(exec)) {
      const busy = await isExecBusy(exec.id);
      if (!busy) {
        available.push(exec);
      }
    }
  }

  if (available.length === 0) return null;
  // Select randomly among available candidates
  return available[Math.floor(Math.random() * available.length)];
};

// Dispatch or reassign a support request (chat or call)
const dispatchSupportRequest = async (io, type, requestId, userEmail, userName, phone) => {
  const payload = {
    type,
    requestId,
    userEmail,
    userName: userName || userEmail.split('@')[0],
    phone: phone || '',
    timestamp: Date.now()
  };

  if (io) {
    io.emit('new_pending_request', payload);
  }
};

// Executive accepts/claims a request
const acceptRequest = async (io, type, requestId, userEmail, execId) => {

  const reqKey = `${type}:${requestId}`;
  if (activeDispatches.has(reqKey)) {
    clearTimeout(activeDispatches.get(reqKey).timer);
    activeDispatches.delete(reqKey);
  }

  if (type === 'chat') {
    await prisma.supportSession.updateMany({
      where: { userEmail },
      data: { execId, status: 'Active' }
    });
  } else {
    await prisma.callRequest.update({
      where: { id: parseInt(requestId) },
      data: { execId, status: 'Connected' }
    });
  }

  if (io) {
    io.emit('support_request_accepted', { reqKey, type, requestId, userEmail, execId });
    io.emit('chat_accepted', { userEmail, execId });
  }

  return true;
};

// Executive declines a request
const declineRequest = async (io, type, requestId, userEmail, execId) => {
  const reqKey = `${type}:${requestId}`;
  let attempted = [execId];

  if (activeDispatches.has(reqKey)) {
    const existing = activeDispatches.get(reqKey);
    clearTimeout(existing.timer);
    attempted = Array.from(new Set([...existing.attemptedExecIds, execId]));
    activeDispatches.delete(reqKey);
  }

  if (io) {
    io.emit('support_request_cancelled', { reqKey, execId, reason: 'declined' });
  }

  console.log(`[Dispatcher] Exec ${execId} declined ${reqKey}. Triggering immediate reassignment...`);
  await dispatchSupportRequest(io, type, requestId, userEmail, '', '', attempted);
  return true;
};

// Resolve request (free executive)
const resolveRequest = async (io, type, requestId, userEmail, execId) => {
  const reqKey = `${type}:${requestId}`;
  if (activeDispatches.has(reqKey)) {
    clearTimeout(activeDispatches.get(reqKey).timer);
    activeDispatches.delete(reqKey);
  }

  if (io) {
    io.emit('support_request_resolved', { reqKey, type, requestId, userEmail, execId });
  }

  // Check if there are unassigned pending requests in queue and try dispatching them now
  // checkPendingQueue(io);
  return true;
};

module.exports = {
  isExecClockedIn,
  isExecBusy,
  findAvailableExec,
  dispatchSupportRequest,
  acceptRequest,
  declineRequest,
  resolveRequest
};
