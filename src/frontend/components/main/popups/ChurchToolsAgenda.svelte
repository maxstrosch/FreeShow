<script lang="ts">
    import { get } from "svelte/store"
    import { uid } from "uid"
    import { Main } from "../../../../types/IPC/Main"
    import type { Project } from "../../../../types/Projects"
    import { requestMain } from "../../../IPC/main"
    import { activePopup, popupData, shows, showsCache } from "../../../stores"
    import { loadShows } from "../../helpers/setShow"
    import { history } from "../../helpers/history"
    import { newToast } from "../../../utils/common"
    import MaterialButton from "../../inputs/MaterialButton.svelte"

    let loading = false
    let creating = false
    let agenda: any = null
    let error = ""
    let matches: Record<number, string> = {}
    let unmatched: number[] = []
    let eventData: any = null

    $: if ($popupData?.event && $popupData.event !== eventData) {
        eventData = $popupData.event
        loadAgenda()
    }

    async function loadAgenda() {
        loading = true
        error = ""
        agenda = null
        const eventId = eventData?.churchTools?.eventId
        if (!eventId) {
            error = "Dieser Kalendertermin ist keinem ChurchTools-Event mit Agenda zugeordnet."
            loading = false
            return
        }
        const result = await requestMain(Main.CHURCHTOOLS_AGENDA_GET, { eventId })
        loading = false
        if (!result?.success) {
            error = result?.error || "Agenda konnte nicht geladen werden."
            return
        }
        agenda = result
        await matchSongs()
    }

    function itemTitle(item: any) {
        return item?.song?.title || item?.song?.name || item?.title || item?.name || item?.text || "Programmpunkt"
    }

    function formatResponsible(value: any): string {
        if (!value) return ""
        if (typeof value === "string") return value
        if (Array.isArray(value)) return value.map(formatResponsible).filter(Boolean).join(", ")
        const persons = value?.persons
        const names = Array.isArray(persons) ? persons.map((entry: any) => {
            const person = entry?.person || {}
            const name = [person.firstName, person.lastName].filter(Boolean).join(" ") || person.title || person.domainAttributes?.email
            return [name, entry?.service].filter(Boolean).join(" ")
        }).filter(Boolean) : []
        return [value?.text, ...names].filter(Boolean).join(" · ")
    }

    function formatGroupNotes(value: any): string {
        if (!value) return ""
        if (typeof value === "string") return value
        if (!Array.isArray(value)) return value?.note || ""
        return value.map((entry: any) => entry?.note).filter(Boolean).join(" · ")
    }

    function itemNotes(item: any): string {
        return [
            item?.note,
            formatResponsible(item?.responsible),
            formatGroupNotes(item?.serviceGroupNotes),
        ].filter(Boolean).join("\\n")
    }

    function itemDuration(item: any): number | null {
        const value = Number(item?.calculatedDuration ?? item?.duration)
        return Number.isFinite(value) && value > 0 ? value : null
    }

    async function matchSongs() {
        const titles = (agenda?.items || []).filter((item: any) => item.type === "song").map((item: any) => itemTitle(item))
        const available = get(shows)
        const ids = Object.entries(available).filter(([, show]: any) =>
            titles.some((title: string) => title.toLocaleLowerCase() === String(show.name || "").toLocaleLowerCase())
        ).map(([id]) => id)
        if (ids.length) await loadShows(ids)
        const cache = get(showsCache)
        const found: Record<number, string> = {}
        const missing: number[] = []
        ;(agenda?.items || []).forEach((item: any, index: number) => {
            if (item.type !== "song") return
            const title = itemTitle(item).trim().toLocaleLowerCase()
            const id = Object.keys(cache).find((showId) => {
                const show = cache[showId]
                return [show?.name, show?.meta?.title].some((name) => String(name || "").trim().toLocaleLowerCase() === title)
            })
            if (id) found[index] = id
            else missing.push(index)
        })
        matches = found
        unmatched = missing
    }

    function createProject() {
        if (!agenda || creating) return
        creating = true
        const project: Project = {
            name: agenda.name || eventData?.name || "ChurchTools-Gottesdienst",
            created: Date.now(),
            modified: Date.now(),
            used: Date.now(),
            parent: "/",
            origin: "churchtools",
            shows: []
        }

        agenda.items.forEach((item: any, index: number) => {
            const title = itemTitle(item)
            const song = item.song || {}
            const songDetails = [song.key ? "Tonart: " + song.key : "", song.bpm ? "BPM: " + song.bpm : "", song.arrangement ? "Arrangement: " + (song.arrangement.name || song.arrangement) : ""].filter(Boolean).join(" · ")
            const note = [item.note, item.responsible, item.serviceGroupNotes, songDetails].filter(Boolean).join("\n")
            if (item.type === "song") {
                const matchedId = matches[index]
                if (matchedId) {
                    project.shows.push({ id: matchedId, type: "show", name: title, notes: note })
                } else {
                    project.shows.push({ id: uid(), type: "section", name: "Nicht zugeordnet: " + title, notes: note || "Kein passender FreeShow-Song gefunden." })
                }
                return
            }
            project.shows.push({
                id: uid(),
                type: "section",
                name: (item.type === "header" ? "▸ " : "") + title,
                notes: [note, item.duration ? "Dauer: " + item.duration : ""].filter(Boolean).join("\n")
            })
        })

        history({ id: "UPDATE", newData: { data: project }, location: { page: "drawer", id: "project" } })
        creating = false
        activePopup.set(null)
        newToast("ChurchTools-Projekt wurde erstellt.")
    }
</script>

{#if loading}
    <p>ChurchTools-Agenda wird geladen …</p>
{:else if error}
    <p style="color: var(--warning);">{error}</p>
    <MaterialButton variant="outlined" on:click={loadAgenda}>Erneut versuchen</MaterialButton>
{:else if agenda}
    <div style="min-width: min(620px, 70vw);">
        <h3>{agenda.name}</h3>
        <p style="opacity: 0.75;margin: 6px 0 14px;">{agenda.items.length} Programmpunkte</p>
        {#each agenda.items as item, index}
            <div style="padding: 9px 10px;border-bottom: 1px solid var(--primary-lighter);">
                <div style="display:flex;align-items:center;gap:8px;">
                    <strong>{index + 1}. {itemTitle(item)}</strong>
                    {#if item.type === "song"}
                        {#if matches[index]}
                            <span style="color: var(--success);">✓ Song gefunden</span>
                        {:else}
                            <span style="color: var(--warning);">Nicht zugeordnet</span>
                        {/if}
                    {:else}
                        <span style="opacity:0.65;">{item.type === "header" ? "Überschrift" : "Programmpunkt"}</span>
                    {/if}
                </div>
                {#if itemNotes(item)}
                    <p style="opacity:0.75;font-size:0.9em;margin-top:4px;white-space:pre-line;">{itemNotes(item)}</p>
                {/if}
                {#if itemDuration(item)}
                    <p style="opacity:0.6;font-size:0.82em;margin:3px 0;">Dauer: {itemDuration(item)} Sekunden</p>
                {/if}
            </div>
        {/each}
        <p style="margin:12px 0;opacity:0.8;">{Object.keys(matches).length} Songs zugeordnet · {unmatched.length} Songs ohne Treffer. Nicht zugeordnete Songs werden als Platzhalter markiert; es werden keine Song-Duplikate erzeugt.</p>
        <MaterialButton variant="contained" disabled={creating} on:click={createProject}>
            ChurchTools-Projekt erstellen
        </MaterialButton>
    </div>
{/if}
