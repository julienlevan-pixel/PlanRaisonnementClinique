export type AttendanceEntry = {
  id: string;
  fullName: string;
  joinedAt: string;
};
export const attendanceTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Toronto";
export function attendanceDate(value: string, timeZone: string) {
  return new Date(value).toLocaleDateString("fr-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}
export function attendanceTime(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return ["hour", "minute", "second"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join(":");
}

/** A real BIFF8 .xls workbook; strings stay text, including names beginning with '='. */
export async function attendanceWorkbook(
  name: string,
  entries: AttendanceEntry[],
  timeZone: string,
) {
  const { utils, write } = await import("@e965/xlsx");
  const sheet = utils.aoa_to_sheet([
    [
      "Séance",
      "Nom et prénom",
      "Date d’inscription",
      "Heure d’inscription",
      "Fuseau horaire",
    ],
    ...entries.map((entry) => [
      name,
      entry.fullName,
      attendanceDate(entry.joinedAt, timeZone),
      attendanceTime(entry.joinedAt, timeZone),
      timeZone,
    ]),
  ]);
  sheet["!cols"] = [
    { wch: 35 },
    { wch: 32 },
    { wch: 20 },
    { wch: 20 },
    { wch: 24 },
  ];
  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, "Présences");
  return write(book, { bookType: "biff8", type: "array" }) as ArrayBuffer;
}
