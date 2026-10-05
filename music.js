(() => {
  const form = document.getElementById("music-search-form");
  const queryInput = document.getElementById("music-search-query");
  const status = document.getElementById("music-status");
  const resultsPanel = document.getElementById("music-results");
  const artistResults = document.getElementById("music-artists");
  const albumResults = document.getElementById("music-albums");
  const trackResults = document.getElementById("music-tracks");
  const nowPlaying = document.getElementById("music-now-playing");
  const player = document.getElementById("music-player");
  const playerSource = document.getElementById("music-player-source");
  const playerImage = document.getElementById("music-player-image");
  const playerTitle = document.getElementById("music-player-title");
  const playerArtist = document.getElementById("music-player-artist");
  const trackLink = document.getElementById("music-track-link");
  let currentSearch;

  function makeArtwork(url, className, alt = "") {
    const image = document.createElement("img");
    image.className = className;
    image.alt = alt;
    image.loading = "lazy";
    image.src = url || "";
    image.addEventListener("error", () => {
      image.hidden = true;
    }, { once: true });
    return image;
  }

  function playTrack(track) {
    if (!track.previewUrl) {
      status.textContent = "A preview is not available for this track.";
      return;
    }

    playerSource.src = track.previewUrl;
    playerImage.src = track.artworkUrl100 || "";
    playerImage.hidden = !track.artworkUrl100;
    playerTitle.textContent = track.trackName;
    playerArtist.textContent = track.artistName;
    trackLink.href = track.trackViewUrl;
    nowPlaying.hidden = false;
    status.textContent = `Loading preview: ${track.trackName} by ${track.artistName}…`;
    player.load();
    player.play().catch((error) => {
      if (error.name === "AbortError") return;
      console.error("Could not start the Apple Music preview.", error);
      status.textContent = error.name === "NotAllowedError"
        ? "Press play in the player to start the preview."
        : "The preview could not be played. Try another track.";
    });
  }

  function createTrackRow(track, index) {
    const row = document.createElement("li");
    row.className = "music-track-row";

    const playButton = document.createElement("button");
    playButton.className = "music-track-play";
    playButton.type = "button";
    playButton.setAttribute("aria-label", `Play preview of ${track.trackName} by ${track.artistName}`);
    playButton.textContent = "▶";
    playButton.addEventListener("click", () => playTrack(track));

    const artwork = makeArtwork(track.artworkUrl100, "music-track-artwork");
    const details = document.createElement("span");
    details.className = "music-track-details";
    const title = document.createElement("strong");
    title.textContent = track.trackName;
    const artist = document.createElement("span");
    artist.textContent = track.artistName;
    details.append(title, artist);

    const album = document.createElement("span");
    album.className = "music-track-album";
    album.textContent = track.collectionName || "Single";

    const duration = document.createElement("span");
    duration.className = "music-track-duration";
    duration.textContent = formatDuration(track.trackTimeMillis);

    const number = document.createElement("span");
    number.className = "music-track-number";
    number.textContent = String(index + 1);
    row.append(number, playButton, artwork, details, album, duration);
    return row;
  }

  function createAlbumCard(album) {
    const button = document.createElement("button");
    button.className = "music-album-card";
    button.type = "button";
    button.setAttribute("aria-label", `Play preview from ${album.collectionName} by ${album.artistName}`);
    button.addEventListener("click", () => playTrack(album));
    button.append(makeArtwork(album.artworkUrl100, "music-album-artwork"));

    const title = document.createElement("strong");
    title.textContent = album.collectionName;
    const artist = document.createElement("span");
    artist.textContent = album.collectionArtistName || album.artistName;
    button.append(title, artist);
    return button;
  }

  function createArtistCard(artist) {
    const button = document.createElement("button");
    button.className = "music-artist-card";
    button.type = "button";
    button.setAttribute("aria-label", `Play preview by ${artist.artistName}`);
    button.addEventListener("click", () => playTrack(artist.track));
    button.append(makeArtwork(artist.track.artworkUrl100, "music-artist-artwork"));
    const name = document.createElement("span");
    name.textContent = artist.artistName;
    button.append(name);
    return button;
  }

  function formatDuration(milliseconds) {
    const duration = Number(milliseconds);
    if (!Number.isFinite(duration) || duration < 0) return "";
    const seconds = Math.floor(duration / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function renderResults(tracks) {
    const artists = new Map();
    const albums = new Map();
    artistResults.replaceChildren();
    albumResults.replaceChildren();
    trackResults.replaceChildren();

    tracks.forEach((track, index) => {
      const artistName = track.collectionArtistName || track.artistName;
      const artistId = track.artistId || artistName;
      if (!artists.has(artistId)) artists.set(artistId, { artistName, track });

      const albumId = track.collectionId || track.collectionName;
      if (albumId && !albums.has(albumId)) albums.set(albumId, track);
      trackResults.append(createTrackRow(track, index));
    });

    artists.forEach((artist) => artistResults.append(createArtistCard(artist)));
    albums.forEach((album) => albumResults.append(createAlbumCard(album)));
    document.getElementById("music-artists-heading").hidden = artists.size === 0;
    document.getElementById("music-albums-heading").hidden = albums.size === 0;
    document.getElementById("music-tracks-heading").hidden = tracks.length === 0;
    resultsPanel.hidden = tracks.length === 0;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = queryInput.value.trim();
    if (!query) return;

    if (currentSearch) currentSearch.abort();
    currentSearch = new AbortController();
    resultsPanel.hidden = true;
    status.textContent = `Searching Apple Music for “${query}”…`;

    const url = new URL("https://itunes.apple.com/search");
    url.search = new URLSearchParams({
      term: query,
      entity: "song",
      limit: "50",
    }).toString();

    try {
      const response = await fetch(url, { signal: currentSearch.signal });
      if (!response.ok) throw new Error(`Apple search returned HTTP ${response.status}.`);
      const data = await response.json();
      const tracks = (data.results || []).filter((track) => track.trackId && track.previewUrl);
      renderResults(tracks);
      status.textContent = tracks.length
        ? `${tracks.length} tracks found for “${query}”. Select a result to play its preview.`
        : `No previewable tracks found for “${query}”. Try another search.`;
    } catch (error) {
      if (error.name === "AbortError") return;
      console.error("Apple Music search failed.", error);
      status.textContent = "Apple Music search is unavailable right now. Please try again later.";
    }
  });

  player.addEventListener("error", () => {
    status.textContent = "This preview could not be loaded. Try another track.";
  });

  player.addEventListener("playing", () => {
    status.textContent = `Playing preview: ${playerTitle.textContent} by ${playerArtist.textContent}.`;
  });
})();
