console.log('Inside spoti2youtu.js');

// Set up Youtube and Spotify API
const youtubeApiKey = 'MY_YOUTUBE_API_KEY';
const spotifyClientId = 'MY_SPOTIFY_CLIENT_ID';
const spotifyClientSecret = 'MY_SPOTIFY_CLIENT_SECRET';
const spotifyRedirectUri = 'MY_SPOTIFY_REDIRECT_URI';

// Initialize Spotify API

const spotifyApi = new SpotifyWebApi({
    clientId: spotifyClientId,
    clientSecret: spotifyClientSecret,
    redirectUri: spotifyRedirectUri,
});
// Check if the Spotify API is authenticated
console.log('Is Spotify API authenticated:', spotifyApi.getAccessToken() !== null);

// Initialize YouTube API
gapi.load('client', initYoutubeApi);

function initYoutubeApi() {
    gapi.client.init({
        apiKey: youtubeApiKey,
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest"],
    }).then(() => {
        // Check if the YouTube API is authenticated
        console.log('Is YouTube API authenticated:', gapi.auth2.getAuthInstance().isSignedIn.get());
    }).catch(error => {
        console.error('Error initializing YouTube API:', error);
    });
}

// Function to check if a given URL is from YouTube or Spotify
function getPlatformAndType(url) {
    if (url.includes('youtu')) {
        return { platform: 'youtube', type: url.includes('list=') ? 'playlist' : 'video' };
    } else if (url.includes('spoti')) {
        return { platform: 'spotify', type: url.includes('/playlist/') ? 'playlist' : 'track' };
    } else {
        return { platform: 'unknown', type: 'unknown' };
    }
}

// Function to extract YouTube playlist ID from URL
function getYouTubePlaylistId(url) {
    const match = url.match(/[?&]list=([^&]+)/);
    return match ? match[1] : null;
}

// Function to create a Spotify playlist with given tracks
async function createSpotifyPlaylist(playlistName, tracks) {
    try {
        const user = await spotifyApi.getMe();
        const userId = user.body.id;

        const createdPlaylist = await spotifyApi.createPlaylist(userId, playlistName, { public: false });
        const playlistId = createdPlaylist.body.id;

        const uris = tracks.map(track => track.uri);
        await spotifyApi.addTracksToPlaylist(userId, playlistId, uris);

        return createdPlaylist.body.external_urls.spotify;
    } catch (error) {
        console.error('Error creating Spotify playlist:', error);
        return null;
    }
}

// Function to create a YouTube playlist with given video titles
async function createYouTubePlaylist(playlistName, videoTitles) {
    try {
        // Create a new playlist
        const createPlaylistResponse = await youtube.playlists.insert({
            part: 'snippet,status',
            resource: {
                snippet: {
                    title: playlistName,
                },
                status: {
                    privacyStatus: 'private', // You can adjust privacyStatus as needed
                },
            },
        });

        const youtubePlaylistId = createPlaylistResponse.data.id;

        // Add videos to the playlist
        await Promise.all(videoTitles.map(async (title) => {
            const searchResponse = await youtube.search.list({
                part: 'snippet',
                q: title,
                type: 'video',
                maxResults: 1,
            });

            const videoId = searchResponse.data.items[0]?.id.videoId;

            if (videoId) {
                await youtube.playlistItems.insert({
                    part: 'snippet',
                    resource: {
                        snippet: {
                            playlistId: youtubePlaylistId,
                            resourceId: {
                                kind: 'youtube#video',
                                videoId: videoId,
                            },
                        },
                    },
                });
            }
        }));

        return youtubePlaylistId;
    } catch (error) {
        console.error('Error creating YouTube playlist:', error);
        return null;
    }
}

// Function to handle YouTube playlist
async function handleYouTubePlaylist(playlistUrl) {
    const playlistId = getYouTubePlaylistId(playlistUrl);

    if (playlistId) {
        try {
            const response = await youtube.playlistItems.list({
                part: 'snippet',
                playlistId: playlistId,
                maxResults: 50,
            });

            const videos = response.data.items;
            const trackNames = videos.map(video => video.snippet.title);

            const playlistName = `Converted Playlist from YouTube: ${playlistUrl}`;
            const spotifyPlaylistUrl = await createSpotifyPlaylist(playlistName, trackNames);

            console.log(`Playlist successfully created on Spotify: ${spotifyPlaylistUrl}`);

            // Create a YouTube playlist from Spotify playlist
            const youtubePlaylistId = await createYouTubePlaylist(playlistName, trackNames);

            console.log(`Playlist successfully created on YouTube: https://www.youtube.com/playlist?list=${youtubePlaylistId}`);
        } catch (error) {
            console.error('Error fetching YouTube playlist:', error);
        }
    } else {
        console.error('Invalid YouTube playlist URL');
    }
}

// Function to handle Spotify playlist or track
async function handleSpotifyPlaylistOrTrack(playlistUrl) {
    try {
        const playlistIdMatch = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
        const trackIdMatch = playlistUrl.match(/track\/([a-zA-Z0-9]+)/);

        if (playlistIdMatch) {
            // It's a Spotify playlist
            const playlistId = playlistIdMatch[1];

            const response = await spotifyApi.getPlaylistTracks(playlistId);
            const tracks = response.body.items;

            console.log('Spotify Playlist Tracks:');
            tracks.forEach(track => {
                console.log(`- ${track.track.name} by ${track.track.artists.map(artist => artist.name).join(', ')}`);
            });
        } else if (trackIdMatch) {
            // It's a single Spotify track
            const trackId = trackIdMatch[1];

            const response = await spotifyApi.getTrack(trackId);
            const track = response.body;

            console.log(`Single Spotify Track: ${track.name} by ${track.artists.map(artist => artist.name).join(', ')}`);
        } else {
            console.error('Invalid Spotify URL');
        }
    } catch (error) {
        console.error('Error handling Spotify playlist or track:', error);
    }
}
// Function to convert playlist based on provided URL
async function convertPlaylist() {
    try {
        console.log('convertPlaylist function called');

        const playlistUrl = document.getElementById('playlistUrl').value;
        console.log('Playlist URL:', playlistUrl);

        if (playlistUrl) {
            const { platform, type } = getPlatformAndType(playlistUrl);
            console.log('Platform:', platform, 'Type:', type);

            if (platform === 'youtube' && type === 'playlist') {
                console.log('Handling YouTube playlist...');
                await handleYouTubePlaylist(playlistUrl);
                console.log('YouTube playlist handled.');
            } else if (platform === 'spotify' && (type === 'playlist' || type === 'track')) {
                console.log('Handling Spotify playlist or track...');
                await handleSpotifyPlaylistOrTrack(playlistUrl);
                console.log('Spotify playlist or track handled.');
            } else {
                console.error('Invalid URL or unsupported platform/type');
            }
        } else {
            console.error('Please enter a playlist URL');
        }
    } catch (error) {
        console.error('Error in convertPlaylist:', error);
    }
}

