import { safeStorage } from "electron"
import { _store } from "../data/store"

export interface ChurchToolsCalendarSettings {
    baseUrl: string
    token: string
}

export interface ChurchToolsSyncResult {
    success: boolean
    calendars?: { id: string; name: string; color: string }[]
    events?: Record<string, any>
    error?: string
}

const ACCESS_KEY = "churchToolsCalendar"

function getSettings(): ChurchToolsCalendarSettings | null {
    const value = _store.ACCESS?.get(ACCESS_KEY) as ChurchToolsCalendarSettings | undefined
    if (!value?.baseUrl || !value?.token) return null
    try {
        if (!value.token.startsWith("encrypted:") || !safeStorage.isEncryptionAvailable()) return null
        const token = safeStorage.decryptString(Buffer.from(value.token.slice(10), "base64"))
        return { ...value, token }
    } catch (error) {
        console.error("Could not decrypt ChurchTools credentials:", error)
        return null
    }
}

export function getChurchToolsCalendarStatus() {
    const settings = getSettings()
    return { configured: !!settings, baseUrl: settings?.baseUrl || "" }
}

export function saveChurchToolsCalendarSettings(input: ChurchToolsCalendarSettings) {
    const baseUrl = String(input.baseUrl || "").trim().replace(/\/+$/, "").replace(/\/api$/i, "")
    const token = String(input.token || "").trim()
    if (!/^https?:\/\//i.test(baseUrl)) return { success: false, error: "Bitte eine gültige ChurchTools-URL eingeben." }
    if (!token) return { success: false, error: "Bitte einen API-Token eingeben." }

    // Credentials are kept only in the non-portable ACCESS store. Never send them back to the renderer.
    try {
        if (!safeStorage.isEncryptionAvailable()) return { success: false, error: "Die sichere lokale Speicherung ist auf diesem System nicht verfügbar." }
        const storedToken = "encrypted:" + safeStorage.encryptString(token).toString("base64")
        _store.ACCESS?.set(ACCESS_KEY, { baseUrl, token: storedToken })
    } catch {
        return { success: false, error: "Die sichere lokale Speicherung ist auf diesem System nicht verfügbar." }
    }
    return { success: true }
}

async function requestChurchTools(path: string, settings: ChurchToolsCalendarSettings) {
    const response = await fetch(settings.baseUrl + "/api" + path, {
        headers: { Authorization: "Login " + settings.token, Accept: "application/json" }
    })
    if (!response.ok) throw new Error(`ChurchTools API: HTTP ${response.status} (${path})`)
    const json = await response.json()
    if (json?.meta?.status && json.meta.status !== 200) throw new Error(json.meta.message || "ChurchTools API request failed")
    return json?.data ?? json
}

function asDate(value: any): string | null {
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function appointmentParts(raw: any) {
    const appointment = raw?.appointment || raw
    const base = appointment?.base || appointment
    const calculated = raw?.calculated || {}
    const calendar = base?.calendar || appointment?.calendar || raw?.calendar || {}
    const id = base?.id ?? appointment?.id ?? raw?.appointmentId
    const start = asDate(calculated?.startDate || appointment?.startDate || base?.startDate)
    const end = asDate(calculated?.endDate || appointment?.endDate || base?.endDate)
    if (id == null || !start) return null
    return {
        id: String(id),
        calendarId: String(calendar?.id ?? raw?.calendarId ?? "unknown"),
        calendarName: calendar?.name || calendar?.nameTranslated || "ChurchTools",
        title: base?.caption || appointment?.caption || appointment?.title || "ChurchTools-Termin",
        start,
        end: end || start,
        information: appointment?.information || base?.information || "",
        allDay: !!base?.allDay,
        location: appointment?.location?.name || appointment?.location || "",
        date: start.slice(0, 10)
    }
}

export async function syncChurchToolsCalendar(range?: { from?: string; to?: string }): Promise<ChurchToolsSyncResult> {
    const settings = getSettings()
    if (!settings) return { success: false, error: "ChurchTools ist noch nicht eingerichtet." }

    try {
        const now = new Date()
        const from = range?.from || new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10)
        const to = range?.to || new Date(now.getFullYear(), now.getMonth() + 13, 0).toISOString().slice(0, 10)
        const rawAppointments = await requestChurchTools(`/calendars/appointments?${new URLSearchParams({ from, to }).toString()}`, settings)
        const appointments = Array.isArray(rawAppointments) ? rawAppointments : rawAppointments?.appointments || []
        const rawCalendars = await requestChurchTools("/calendars", settings).catch(() => [])
        const calendarList = Array.isArray(rawCalendars) ? rawCalendars : rawCalendars?.calendars || []
        const calendarMap = new Map(calendarList.map((c: any) => [String(c.id), c]))
        const events: Record<string, any> = {}

        for (const raw of appointments) {
            const item = appointmentParts(raw)
            if (!item) continue
            const cal = calendarMap.get(item.calendarId) as any
            const origin = "churchtools:" + item.calendarId
            const stableId = `ct_${item.calendarId}_${item.id}_${item.date}`
            let eventId: string | undefined
            try {
                const combined = await requestChurchTools(`/calendars/${encodeURIComponent(item.calendarId)}/appointments/${encodeURIComponent(item.id)}/${item.date}`, settings)
                const event = combined?.event
                if (event?.domainIdentifier || event?.id || event?.eventId) eventId = String(event.domainIdentifier || event.id || event.eventId)
            } catch {
                // Some calendar appointments are not linked to an Event in the ChurchTools event module.
            }
            events[stableId] = {
                id: stableId,
                type: "event",
                name: item.title,
                color: cal?.color || "#3B82F6",
                notes: item.information,
                location: item.location,
                from: item.start,
                to: item.end,
                time: !item.allDay,
                repeat: false,
                origin,
                churchTools: { calendarId: item.calendarId, appointmentId: item.id, eventId, date: item.date }
            }
        }

        return {
            success: true,
            calendars: calendarList.map((cal: any) => ({
                id: String(cal.id),
                name: cal.name || cal.nameTranslated || "ChurchTools",
                color: cal.color || "#3B82F6"
            })),
            events
        }
    } catch (error: any) {
        return { success: false, error: error?.message || "ChurchTools-Synchronisierung fehlgeschlagen." }
    }
}


export interface ChurchToolsAgendaResult {
    success: boolean
    name?: string
    items?: any[]
    error?: string
}

/** Load the agenda belonging to a ChurchTools Event-module event. */
export async function getChurchToolsAgenda(eventId: string): Promise<ChurchToolsAgendaResult> {
    const settings = getSettings()
    if (!settings) return { success: false, error: "ChurchTools ist noch nicht eingerichtet." }
    if (!eventId || !/^\d+$/.test(String(eventId))) return { success: false, error: "Für diesen Kalendertermin ist keine verknüpfte ChurchTools-Veranstaltung hinterlegt." }

    try {
        const agenda = await requestChurchTools(`/events/${encodeURIComponent(eventId)}/agenda`, settings)
        const data = agenda?.data || agenda
        const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : null
        if (!items) return { success: false, error: "ChurchTools hat keine gültige Agenda zurückgegeben." }
        return { success: true, name: data?.name || "ChurchTools-Agenda", items }
    } catch (error: any) {
        return { success: false, error: error?.message || "ChurchTools-Agenda konnte nicht geladen werden." }
    }
}
