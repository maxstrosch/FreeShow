import axios from "axios"

export interface ChurchToolsEvent {
    id: number | string
    name?: string
    title?: string
    startDate?: string
    endDate?: string
    [key: string]: any
}

export interface ChurchToolsAgendaItem {
    id: number | string
    title: string
    type: string
    duration?: number
    note?: string
    position?: number
    responsible?: { text?: string; persons?: any[] }
    song?: { title?: string; [key: string]: any }
    [key: string]: any
}

function getClient(baseUrl: string, token: string) {
    const url = baseUrl.trim().replace(/\/+$/, "")
    if (!/^https?:\/\//i.test(url)) throw new Error("Bitte eine gültige ChurchTools-URL inklusive https:// angeben.")
    if (!token.trim()) throw new Error("Bitte ein ChurchTools-Login-Token eingeben.")
    return axios.create({
        baseURL: url,
        timeout: 20000,
        headers: { Authorization: `Login ${token.trim()}`, Accept: "application/json" }
    })
}

function unwrapData(data: any): any {
    return data?.data ?? data
}

export async function churchToolsTestConnection(baseUrl: string, token: string): Promise<{ success: boolean; message: string }> {
    try {
        await getClient(baseUrl, token).get("/api/events", { params: { limit: 1 } })
        return { success: true, message: "Verbindung zu ChurchTools erfolgreich." }
    } catch (error: any) {
        return { success: false, message: error?.response?.data?.message || error?.message || "Verbindung fehlgeschlagen." }
    }
}

export async function churchToolsFetchEvents(baseUrl: string, token: string): Promise<ChurchToolsEvent[]> {
    const response = await getClient(baseUrl, token).get("/api/events")
    const data = unwrapData(response.data)
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.items)) return data.items
    if (Array.isArray(data?.events)) return data.events
    return []
}

export async function churchToolsFetchAgenda(baseUrl: string, token: string, eventId: string | number): Promise<{ event: any; items: ChurchToolsAgendaItem[] }> {
    if (!String(eventId).trim()) throw new Error("Bitte zuerst ein Event auswählen.")
    const response = await getClient(baseUrl, token).get(`/api/events/${encodeURIComponent(String(eventId))}/agenda`)
    const data = unwrapData(response.data)
    return { event: data, items: Array.isArray(data?.items) ? data.items : [] }
}
