<script>
  import scheduleData from '$lib/schedule.json';
  import { onMount } from 'svelte';
  import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'; // Corrected import

  /** @type {typeof scheduleData} */
  let schedule = scheduleData;
  let days = ['Friday', 'Saturday', 'Sunday'];
  let selectedDay = 'Friday';
  /** @type {number} - Time in minutes from midnight *in festival timezone* */
  let selectedTime = 15 * 60; // Default: 3:00 PM Pacific
  /** @type {string[]} */
  let stages = [];
  /** @type {typeof scheduleData} */
  let filteredPerformances = [];

  const festivalTimeZone = 'America/Los_Angeles'; // Coachella timezone
  let selectedTimezone = ''; // Will be set to user's timezone in onMount
  let availableTimezones = [
    { label: 'Local', value: '' }, // Placeholder, will be replaced
    { label: 'Pacific (Festival Time)', value: 'America/Los_Angeles' },
    { label: 'Mountain', value: 'America/Denver' },
    { label: 'Central', value: 'America/Chicago' },
    { label: 'Eastern', value: 'America/New_York' },
    { label: 'UTC', value: 'UTC' },
  ];

  /**
   * Livestream links. Quasar has day-specific links.
   * @type {Record<string, string | Record<string, string>>}
   */
  const livestreamLinks = {
    'Coachella Stage': 'Y2FzDMuJ5pI',
    'Outdoor Theatre': 'WxwawRL_nY8',
    'Sahara': 'afO7r8TQTSw',
    'Mojave': 'BajnpDN6vG8',
    'Gobi': 'Kg-KswkXoBg',
    'Sonora': 'TdHrgLciYWw',
    'Quasar': { // Day-specific links for Quasar
        'Friday': '1MOJG5VTh-Y',
        'Saturday': 'SreThbvUUI8',
        'Sunday': 'jKWRY1btTOs'
    }
    // Yuma does not have specified livestreams
  };

  // --- Time Conversion Functions ---

  /**
   * Converts HH:MM string (assumed festival time) to minutes from midnight (festival time).
   * Handles times crossing midnight (e.g., 00:10 is treated as 24:10 = 1450 minutes).
   * @param {string | undefined} timeStr - Time string like "23:10" or "00:10"
   * @returns {number} Minutes from midnight in festival time
   */
  function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    // Treat early morning hours (e.g., 12 AM to 5 AM) as part of the previous day's schedule continuation
    if (hours < 5) {
      return (hours + 24) * 60 + minutes;
    }
    return hours * 60 + minutes;
  }

  /**
   * Creates a Date object representing a specific time on a generic date in the festival timezone.
   * @param {number} minutesFromMidnight - Minutes from midnight in festival time.
   * @returns {Date} A Date object (UTC timestamp) representing that festival time.
   */
  function createFestivalDate(minutesFromMidnight) {
    const hours = Math.floor(minutesFromMidnight / 60) % 24; // Use modulo for hours > 23
    const minutes = minutesFromMidnight % 60;
    // Use a fixed date, the specific date doesn't matter, only the time and timezone offset
    // Need to construct the date string carefully for fromZonedTime
    // Format: 'YYYY-MM-DDTHH:mm:ss' - Use a date known to be within standard time if possible
    // Or handle potential DST shifts if necessary, though less critical for relative display.
    // Let's use a date within the festival timeframe.
    const baseDate = selectedDay === 'Friday' ? '2025-04-11' : selectedDay === 'Saturday' ? '2025-04-12' : '2025-04-13';
    // If minutes indicate the next day (e.g., > 1440), adjust the date string
    const dateStrDate = minutesFromMidnight >= 1440 ? (selectedDay === 'Friday' ? '2025-04-12' : selectedDay === 'Saturday' ? '2025-04-13' : '2025-04-14') : baseDate;

    const dateStr = `${dateStrDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    try {
        return fromZonedTime(dateStr, festivalTimeZone); // Use corrected function name
    } catch (e) {
        console.error("Error creating festival date:", dateStr, festivalTimeZone, e);
        // Fallback to a generic date if parsing fails
        const fallbackDateStr = `2025-04-11T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
        return fromZonedTime(fallbackDateStr, festivalTimeZone);
    }
  }

   /**
   * Formats the selected slider time (minutes from midnight in festival time) into a string
   * displayed in the *selected* timezone.
   * @param {number} minutes - Minutes from midnight in festival time.
   * @returns {string} Formatted time string (e.g., "3:00 PM")
   */
  function formatSliderTime(minutes) {
    const festivalDate = createFestivalDate(minutes);
    return formatInTimeZone(festivalDate, selectedTimezone || festivalTimeZone, 'h:mm a');
  }

  /**
   * Formats a performance start/end time string (HH:MM festival time) into a string
   * displayed in the *selected* timezone.
   * @param {string | undefined} timeStr - Time string like "23:10"
   * @returns {string} Formatted time string (e.g., "11:10 PM")
   */
  function formatPerformanceTime(timeStr) {
    if (!timeStr) return '-';
    const minutes = timeToMinutes(timeStr);
    const festivalDate = createFestivalDate(minutes);
    return formatInTimeZone(festivalDate, selectedTimezone || festivalTimeZone, 'h:mm a');
  }


  // --- Filtering Logic ---

  // Reactive statement to filter performances based on selected day and time
  $: {
    // Get all unique stages for the selected day first
    const stagesForDay = [...new Set(schedule.filter(p => p.day === selectedDay).map(p => p.stage))].sort();
    stages = stagesForDay; // Update the stages list

    // Filter performances happening at the selected time
    filteredPerformances = schedule.filter(p => {
        if (p.day !== selectedDay) return false; // Ensure correct day

        const startMinutes = timeToMinutes(p.start);
        const endMinutes = timeToMinutes(p.end);

        // Simplified check: selectedTime must be >= start AND < end
        // This works because timeToMinutes handles the wrap-around (e.g., 00:10 becomes 1450)
        return selectedTime >= startMinutes && selectedTime < endMinutes;
    });
  }

  // --- Initialization ---

  onMount(() => {
    // Detect user's timezone
    try {
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        selectedTimezone = userTimezone;
        // Update 'Local' option label
        const localOption = availableTimezones.find(tz => tz.label === 'Local'); // Find by label initially
        if (localOption) {
            localOption.label = `Local (${userTimezone.split('/').pop()?.replace('_', ' ') || userTimezone})`;
            localOption.value = userTimezone; // Set value so selection works
            availableTimezones = [...availableTimezones]; // Trigger reactivity
        }
    } catch (e) {
        console.error("Could not detect user timezone:", e);
        selectedTimezone = festivalTimeZone; // Fallback to festival time
        const localOption = availableTimezones.find(tz => tz.label === 'Local');
         if (localOption) {
            localOption.label = `Local (Unknown)`;
            localOption.value = festivalTimeZone; // Fallback value
            availableTimezones = [...availableTimezones];
         }
    }


    // Set initial slider time based on current time
    const now = new Date();
    const nowInFestivalTime = toZonedTime(now, festivalTimeZone); // Use corrected function name
    const currentHourFestival = nowInFestivalTime.getHours();
    const currentMinuteFestival = nowInFestivalTime.getMinutes();
    let currentTimeMinutesFestival = currentHourFestival * 60 + currentMinuteFestival;

    // Adjust for 'next day' if current time is past midnight festival time
     if (currentHourFestival < 5) { // Treat early morning as part of previous day's schedule
       currentTimeMinutesFestival += 24 * 60;
     }

    // Define slider range (Festival Time)
    const sliderMin = 12 * 60; // 12:00 PM
    const sliderMax = (24 + 2) * 60; // Extend to 2:00 AM (26 * 60 = 1560)

    if (currentTimeMinutesFestival >= sliderMin && currentTimeMinutesFestival <= sliderMax) {
      // Set slider to current time, rounded to nearest 5 minutes
      selectedTime = Math.round(currentTimeMinutesFestival / 5) * 5;
    } else {
      // Keep default if current time is outside typical hours
      selectedTime = 15 * 60; // 3:00 PM Pacific
    }

    // Set selectedDay based on current day in festival time (adjusting for early morning)
    let currentDayIndexFestival = nowInFestivalTime.getDay(); // Sunday=0, Monday=1... Saturday=6

    // If it's early morning (before 5 AM), consider it the end of the *previous* day's schedule
    if (currentHourFestival < 5) {
        currentDayIndexFestival = (currentDayIndexFestival === 0) ? 6 : currentDayIndexFestival - 1;
    }

    // Check if it's actually a festival day based on date (optional, but good practice)
    // const festivalDates = ['2025-04-11', '2025-04-12', '2025-04-13']; // Example dates
    // const currentFestivalDateStr = formatInTimeZone(nowInFestivalTime, festivalTimeZone, 'yyyy-MM-dd');
    // if (festivalDates.includes(currentFestivalDateStr)) { ... }

    if (currentDayIndexFestival === 5) selectedDay = 'Friday'; // Friday
    else if (currentDayIndexFestival === 6) selectedDay = 'Saturday'; // Saturday
    else if (currentDayIndexFestival === 0) selectedDay = 'Sunday'; // Sunday
    else selectedDay = 'Friday'; // Default if not a festival day (e.g., Monday)

  });

  /**
   * Gets the correct livestream link for a stage, handling day-specific links.
   * @param {string} stageName
   * @returns {string | undefined} The YouTube video ID or undefined if no link exists.
   */
  function getLivestreamLink(stageName) {
      const linkData = livestreamLinks[stageName];
      if (typeof linkData === 'string') {
          return linkData; // Standard link
      } else if (typeof linkData === 'object' && linkData !== null) {
          // Day-specific link (e.g., Quasar)
          return linkData[selectedDay];
      }
      return undefined; // No link found
  }

  /**
   * Resets the time slider based on current time, using the same logic as initial load
   */
  function resetTimeToDefault() {
    // Get current time in festival timezone
    const now = new Date();
    const nowInFestivalTime = toZonedTime(now, festivalTimeZone);
    const currentHourFestival = nowInFestivalTime.getHours();
    const currentMinuteFestival = nowInFestivalTime.getMinutes();
    let currentTimeMinutesFestival = currentHourFestival * 60 + currentMinuteFestival;

    // Adjust for 'next day' if current time is past midnight festival time
    if (currentHourFestival < 5) { // Treat early morning as part of previous day's schedule
      currentTimeMinutesFestival += 24 * 60;
    }

    // Define slider range (Festival Time)
    const sliderMin = 12 * 60; // 12:00 PM
    const sliderMax = (24 + 2) * 60; // Extend to 2:00 AM (26 * 60 = 1560)

    if (currentTimeMinutesFestival >= sliderMin && currentTimeMinutesFestival <= sliderMax) {
      // Set slider to current time, rounded to nearest 5 minutes
      selectedTime = Math.round(currentTimeMinutesFestival / 5) * 5;
    } else {
      // Use default if current time is outside typical hours
      selectedTime = 15 * 60; // 3:00 PM Pacific
    }
  }

</script>

<svelte:head>
  <title>Coachella 2025 Schedule</title>
  <meta name="description" content="Browse the Coachella 2025 lineup by day, time, and stage with timezone support and livestream links" />
</svelte:head>

<div class="container">
  <h1>Coachella 2025 Schedule</h1>

  <div class="controls">
    <div class="day-selector">
      <label for="day">Day:</label>
      <select bind:value={selectedDay} id="day">
        {#each days as day}
          <option value={day}>{day}</option>
        {/each}
      </select>
    </div>

     <div class="timezone-selector">
      <label for="timezone">Timezone:</label>
      <select bind:value={selectedTimezone} id="timezone">
        {#each availableTimezones as tz}
          <option value={tz.value}>{tz.label}</option>
        {/each}
      </select>
    </div>

    <div class="time-selector">
       <!-- Display time in selected timezone -->
      <label for="time">Time: {formatSliderTime(selectedTime)}</label>
      <div class="time-controls">
        <!-- Time slider from 12 PM (720 min) to 2:00 AM (1560 min -> 26 * 60) festival time -->
        <input
          type="range"
          id="time"
          bind:value={selectedTime}
          min={720}
          max={1560}
          step={5}
        />
        <button class="reset-button" on:click={resetTimeToDefault}>Reset Time</button>
      </div>
    </div>
  </div>

  <div class="schedule-grid">
     <!-- Display time in selected timezone -->
    <h2>Performances around {formatSliderTime(selectedTime)} on {selectedDay}</h2>
    {#if stages.length > 0}
      <ul>
         <!-- Iterate over all stages for the selected day -->
        {#each stages as stage}
          {@const performance = filteredPerformances.find(p => p.stage === stage)}
          {@const liveLink = getLivestreamLink(stage)}
          <li data-stage={stage}>
            <strong class="stage-name">
              {stage}
              {#if liveLink}
                <a href="https://www.youtube.com/watch?v={liveLink}" target="_blank" title="Watch Livestream for {stage} on {selectedDay}" class="livestream-link" aria-label="Watch Livestream for {stage} on {selectedDay}">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path fill-rule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clip-rule="evenodd" />
                  </svg>
                </a>
              {/if}
            </strong>
            {#if performance}
               <!-- Display performance times in selected timezone -->
              <span>{performance.artist} ({formatPerformanceTime(performance.start)} - {formatPerformanceTime(performance.end)})</span>
            {:else}
              <span>-</span>
            {/if}
          </li>
        {/each}
      </ul>
    {:else}
       <!-- This case might not be reached if stages always has items for a selected day -->
      <p>No stages found for {selectedDay}.</p>
    {/if}
  </div>

</div>

<style>
  :root {
    --primary-color: #3a86ff;
    --primary-light: #61a0ff;
    --primary-dark: #2667cc;
    --text-color: #333;
    --background-color: #f9f9f9;
    --card-background: #ffffff;
    --border-radius: 8px;
    --box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    --transition: all 0.3s ease;
    
    /* Stage-specific colors - more subtle and less harsh on the eyes */
    --stage-coachella: #e63946;     /* Slightly muted red */
    --stage-outdoor: #f9c74f;       /* Softer yellow/gold */
    --stage-sahara: #90be6d;        /* Softer green */
    --stage-mojave: #43a6c6;        /* Softer blue */
    --stage-gobi: #8d6a9f;          /* Softer purple */
    --stage-sonora: #d66ba0;        /* Softer pink */
    --stage-yuma: #4cc9f0;          /* Softer teal */
    --stage-quasar: #f3a261;        /* Softer orange */
  }

  .container {
    max-width: 1200px;
    margin: 2rem auto;
    padding: 1.5rem;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--text-color);
    background-color: var(--background-color);
    border-radius: var(--border-radius);
    box-shadow: var(--box-shadow);
  }

  h1 {
    font-size: 2.2rem;
    margin-bottom: 1.5rem;
    color: var(--primary-color);
    text-align: center;
  }

  h2 {
    font-size: 1.4rem;
    margin-bottom: 1rem;
    color: var(--primary-dark);
  }

  .controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2.5rem;
    align-items: start;
  }

  .day-selector, .timezone-selector, .time-selector {
    background-color: var(--card-background);
    padding: 1rem;
    border-radius: var(--border-radius);
    box-shadow: var(--box-shadow);
  }

  .time-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
    margin-top: 0.8rem;
  }

  .time-controls input[type="range"] {
    flex-grow: 1;
    height: 6px;
    -webkit-appearance: none;
    appearance: none;
    background: #ddd;
    border-radius: 3px;
    outline: none;
  }

  .time-controls input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    background: var(--primary-color);
    border-radius: 50%;
    cursor: pointer;
    transition: var(--transition);
  }

  .time-controls input[type="range"]::-moz-range-thumb {
    width: 18px;
    height: 18px;
    background: var(--primary-color);
    border-radius: 50%;
    cursor: pointer;
    border: none;
    transition: var(--transition);
  }

  .time-controls input[type="range"]::-webkit-slider-thumb:hover {
    background: var(--primary-light);
    transform: scale(1.1);
  }

  .time-controls input[type="range"]::-moz-range-thumb:hover {
    background: var(--primary-light);
    transform: scale(1.1);
  }

  .reset-button {
    padding: 0.5rem 0.8rem;
    background-color: var(--primary-color);
    color: white;
    border: none;
    border-radius: var(--border-radius);
    cursor: pointer;
    font-size: 0.9rem;
    white-space: nowrap;
    transition: var(--transition);
  }

  .reset-button:hover {
    background-color: var(--primary-light);
    transform: translateY(-2px);
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-color);
  }

  select {
    width: 100%;
    padding: 0.6rem 0.8rem;
    border: 1px solid #ddd;
    border-radius: var(--border-radius);
    font-size: 1rem;
    background-color: white;
    transition: var(--transition);
    cursor: pointer;
  }

  select:focus {
    border-color: var(--primary-color);
    outline: none;
    box-shadow: 0 0 0 2px rgba(58, 134, 255, 0.2);
  }

  .schedule-grid {
    background-color: var(--card-background);
    padding: 1.5rem;
    border-radius: var(--border-radius);
    box-shadow: var(--box-shadow);
  }

  .schedule-grid ul {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .schedule-grid li {
    margin-bottom: 0;
    padding: 1rem;
    border: none;
    background-color: #f5f5f5;
    border-radius: var(--border-radius);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: var(--transition);
    border-top: 4px solid #ccc; /* Default border color */
  }

  /* Stage-specific styling */
  .schedule-grid li[data-stage="Coachella Stage"] {
    border-top-color: var(--stage-coachella);
  }

  .schedule-grid li[data-stage="Outdoor Theatre"] {
    border-top-color: var(--stage-outdoor);
  }

  .schedule-grid li[data-stage="Sahara"] {
    border-top-color: var(--stage-sahara);
  }

  .schedule-grid li[data-stage="Mojave"] {
    border-top-color: var(--stage-mojave);
  }

  .schedule-grid li[data-stage="Gobi"] {
    border-top-color: var(--stage-gobi);
  }

  .schedule-grid li[data-stage="Sonora"] {
    border-top-color: var(--stage-sonora);
  }

  .schedule-grid li[data-stage="Yuma"] {
    border-top-color: var(--stage-yuma);
  }

  .schedule-grid li[data-stage="Quasar"] {
    border-top-color: var(--stage-quasar);
  }

  .schedule-grid li:hover {
    transform: translateY(-3px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .stage-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.1rem;
    color: var(--text-color);
    margin-bottom: 0.3rem;
  }

  /* Stage-specific text colors */
  li[data-stage="Coachella Stage"] .stage-name {
    color: var(--stage-coachella);
  }

  li[data-stage="Outdoor Theatre"] .stage-name {
    color: var(--stage-outdoor);
  }

  li[data-stage="Sahara"] .stage-name {
    color: var(--stage-sahara);
  }

  li[data-stage="Mojave"] .stage-name {
    color: var(--stage-mojave);
  }

  li[data-stage="Gobi"] .stage-name {
    color: var(--stage-gobi);
  }

  li[data-stage="Sonora"] .stage-name {
    color: var(--stage-sonora);
  }

  li[data-stage="Yuma"] .stage-name {
    color: var(--stage-yuma);
  }

  li[data-stage="Quasar"] .stage-name {
    color: var(--stage-quasar);
  }

  .livestream-link svg {
    display: inline-block;
    vertical-align: middle;
    color: #ff0000;
    transition: transform 0.2s ease-in-out;
  }

  .livestream-link:hover svg {
    transform: scale(1.3);
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .controls {
      grid-template-columns: 1fr;
    }
    
    .schedule-grid ul {
      grid-template-columns: 1fr;
    }
    
    h1 {
      font-size: 1.8rem;
    }
  }
</style>
