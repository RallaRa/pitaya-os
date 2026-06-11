export interface MessengerCalendarEvent {
  id: string;
  source: 'calendar' | 'hr';
  title: string;
  date: string;
  endDate?: string;
  startTime?: string;
  description?: string;
  eventType?: string;
  type?: string;
}
