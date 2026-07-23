export function diffAndMerge(previous = [], incoming = [], protectedIds = new Set()) {
  const previousById = new Map(previous.map(r => [r.id, r]));
  const incomingIds = new Set(incoming.map(r => r.id));
  let created = 0, updated = 0, unchanged = 0, skippedProtected = 0;

  const merged = [];

  for (const record of incoming) {
    if (protectedIds.has(record.id)) {
      skippedProtected++;
      merged.push(previousById.get(record.id) || record);
      continue;
    }
    const prev = previousById.get(record.id);
    if (!prev) { created++; merged.push(record); continue; }
    if (prev.write_date !== record.write_date) { updated++; merged.push(record); continue; }
    unchanged++;
    merged.push(record);
  }

  for (const [id, record] of previousById) {
    if (!incomingIds.has(id) && protectedIds.has(id)) {
      merged.push(record);
      skippedProtected++;
    }
  }

  return { merged, stats: { created, updated, unchanged, skippedProtected } };
}

export function applyIncrementalDelta(previous = [], incoming = [], protectedIds = new Set()) {
  const previousById = new Map(previous.map(r => [r.id, r]));
  let created = 0, updated = 0, deleted = 0, skippedProtected = 0;

  for (const record of incoming) {
    const prev = previousById.get(record.id);

    if (protectedIds.has(record.id)) {
      skippedProtected++;
      continue;
    }

    if (record.active === false) {
      if (prev) {
        previousById.delete(record.id);
        deleted++;
      }
      continue;
    }

    if (!prev) {
      created++;
    } else if (prev.write_date !== record.write_date) {
      updated++;
    }
    previousById.set(record.id, record);
  }

  return { merged: Array.from(previousById.values()), stats: { created, updated, deleted, skippedProtected } };
}
