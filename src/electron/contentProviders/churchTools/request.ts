import axios from "axios"
import { uid } from "uid"
import { ToMain } from "../../../types/IPC/ToMain"
import { sendToMain } from "../../IPC/main"
import { getStore } from "../../data/store"

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
    start?: string
    position?: number
    note?: string
    responsible?: { text?: string; persons?: any[] }
    song?: { title?: string; [key: string]: any }
    [key: string]: any
}

function getClient(baseUrl: string, token: string) {
    const url = baseUrl.trim().replace(/\\/+$/, "")
    if (!/^https?:\\/\\//i.test(url)) throw new Error("Bitte eine gültige ChurchTools-URL inklusive https:// angeben.")
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

function normalizeSongTitle(value: string): string {
    return value.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/&/g, "und").replace(/[^a-z0-9]/g, "")
}

function makePlaceholderSong(title: string, sourceId: string, notes: string) {
    const layoutId = uid()
    const slideId = uid()
    const showId = `churchtools_song_${sourceId}`
    return {
        id: showId,
        name: title,
        origin: "churchtools",
        category: "churchtools",
        timestamps: { created: Date.now(), modified: null, used: null },
        meta: { title, author: "", artist: "", copyright: "", CCLI: "" },
        settings: { activeLayout: layoutId, template: null },
        layouts: { [layoutId]: { name: "Default", notes, slides: [{ id: slideId }] } },
        slides: {
            [slideId]: {
                group: null, color: null, settings: {}, notes,
                items: [{ style: "left:50px;top:120px;width:1820px;height:840px;", lines: [{ align: "center", text: [{ style: "", value: title }] }] }]
            }
        },
        media: {}
    }
}

export async function churchToolsImportAgenda(baseUrl: string, token: string, eventId: string | number): Promise<{ success: boolean; matched: number; created: number; projectName: string }> {
    const { event, items } = await churchToolsFetchAgenda(baseUrl, token, eventId)
    if (!items.length) throw new Error("Der ChurchTools-Ablaufplan enthält keine Programmpunkte.")

    const localShows = getStore("SHOWS") || {}
    const normalizedShows = Object.entries(localShows).map(([id, show]: [string, any]) => ({ id, name: show?.name || "", normalized: normalizeSongTitle(show?.name || "") }))
    const importedShows: any[] = []
    const projectItems: any[] = []
    let matched = 0
    let created = 0

    for (const item of [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
        const kind = String(item.type || "").toLowerCase()
        const title = kind === "song" ? (item.song?.title || item.title || "") : (item.title || "")
        const duration = Number(item.duration) || undefined
        const note = [item.note, item.responsible?.text, item.serviceGroupNotes].filter(Boolean).join("\n")

        if (kind === "header") {
            projectItems.push({ type: "section", id: uid(), name: title, scheduleLength: duration, notes: note })
            continue
        }

        if (kind === "song") {
            const normalized = normalizeSongTitle(title)
            const exact = normalizedShows.find((show) => show.normalized === normalized && normalized)
            if (exact) {
                matched++
                projectItems.push({ type: "show", id: exact.id, name: exact.name, scheduleLength: duration, notes: note, providerItemId: String(item.id) })
            } else {
                const placeholder = makePlaceholderSong(title, String(item.id), note || "Automatisch aus ChurchTools angelegt. Bitte Liedtext/Slides ergänzen.")
                importedShows.push(placeholder)
                created++
                projectItems.push({ type: "show", id: placeholder.id, name: title, scheduleLength: duration, notes: note, providerItemId: String(item.id) })
            }
            continue
        }

        const text = [title, item.note].filter(Boolean).join("\n")
        const placeholder = makePlaceholderSong(title || "Programmpunkt", String(item.id), note)
        if (kind === "text" && text) {
            const slideId = Object.keys(placeholder.slides)[0]
            placeholder.slides[slideId].items[0].lines = text.split(/\r?\n/).map((line: string) => ({ align: "", text: [{ style: "", value: line }] }))
            importedShows.push(placeholder)
            projectItems.push({ type: "show", id: placeholder.id, name: title, scheduleLength: duration, notes: note, providerItemId: String(item.id) })
        } else {
            projectItems.push({ type: "section", id: uid(), name: title || kind || "Programmpunkt", scheduleLength: duration, notes: note })
        }
    }

    const eventName = event?.name || event?.title || `ChurchTools Event ${eventId}`
    const project = {
        id: `churchtools_${eventId}`,
        name: eventName,
        created: Date.now(),
        parent: "",
        origin: "churchtools",
        items: projectItems
    }

    sendToMain(ToMain.PROVIDER_PROJECTS, {
        providerId: "churchtools" as any,
        categoryName: "ChurchTools",
        shows: importedShows,
        projects: [project]
    })
    return { success: true, matched, created, projectName: eventName }
}
