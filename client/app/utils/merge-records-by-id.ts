export default function mergeRecordsById<
  RecordType extends { id: string | null },
>(existingRecords: RecordType[], nextRecords: RecordType[]): RecordType[] {
  const recordsById = new Map<string, RecordType>();

  for (const record of [...existingRecords, ...nextRecords]) {
    if (!record.id) {
      continue;
    }

    recordsById.set(record.id, record);
  }

  return [...recordsById.values()];
}
