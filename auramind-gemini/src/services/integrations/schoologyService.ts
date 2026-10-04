// Schoology Integration Service for BonaMind
// Handles OAuth 1.0 authentication and content extraction from Schoology LMS

interface SchoologyCredentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken?: string;
  accessTokenSecret?: string;
}

interface SchoologyUser {
  id: string;
  name: string;
  email: string;
  school_name: string;
}

interface SchoologyCourse {
  id: string;
  title: string;
  description: string;
  section_title: string;
  course_code: string;
}

interface SchoologyAssignment {
  id: string;
  title: string;
  description: string;
  due: string;
  type: string;
  max_points: number;
}

interface SchoologyMaterial {
  id: string;
  title: string;
  description: string;
  type: string;
  content: string;
  attachments: Array<{
    id: string;
    name: string;
    type: string;
    download_link: string;
  }>;
}

class SchoologyService {
  private credentials: SchoologyCredentials | null = null;
  private baseUrl = 'https://api.schoology.com/v1';

  // Initialize with credentials from environment or user settings
  async initialize(credentials?: SchoologyCredentials): Promise<void> {
    if (credentials) {
      this.credentials = credentials;
    } else {
      // Load from user metadata or environment
      this.credentials = await this.loadStoredCredentials();
    }
  }

  // OAuth 1.0 Three-Legged Flow
  async initiateOAuth(): Promise<string> {
    if (!this.credentials?.consumerKey || !this.credentials?.consumerSecret) {
      throw new Error('Schoology API credentials not configured');
    }

    // Step 1: Get request token
    const requestTokenUrl = 'https://api.schoology.com/oauth/request_token';
    const callbackUrl = `${window.location.origin}/auth/schoology/callback`;
    
    const oauthParams = {
      oauth_consumer_key: this.credentials.consumerKey,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: this.generateNonce(),
      oauth_version: '1.0',
      oauth_callback: callbackUrl
    };

    const signature = this.generateSignature('POST', requestTokenUrl, oauthParams, this.credentials.consumerSecret);
    const authHeader = this.buildAuthHeader({ ...oauthParams, oauth_signature: signature });

    try {
      const response = await fetch(requestTokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get request token: ${response.statusText}`);
      }

      const responseText = await response.text();
      const params = new URLSearchParams(responseText);
      
      const requestToken = params.get('oauth_token');
      const requestTokenSecret = params.get('oauth_token_secret');

      if (!requestToken || !requestTokenSecret) {
        throw new Error('Invalid response from Schoology OAuth');
      }

      // Store request token secret for later
      localStorage.setItem('schoology_request_token_secret', requestTokenSecret);

      // Step 2: Redirect user to authorize
      const authUrl = `https://www.schoology.com/oauth/authorize?oauth_token=${requestToken}`;
      return Promise.resolve(authUrl);

    } catch (error) {
      console.error('Schoology OAuth initiation failed:', error);
      throw error;
    }
  }

  // Handle OAuth callback and get access token
  async handleCallback(oauthToken: string, oauthVerifier: string): Promise<void> {
    const requestTokenSecret = localStorage.getItem('schoology_request_token_secret');
    if (!requestTokenSecret) {
      throw new Error('Request token secret not found');
    }

    if (!this.credentials?.consumerKey || !this.credentials?.consumerSecret) {
      throw new Error('Schoology API credentials not configured');
    }

    const accessTokenUrl = 'https://api.schoology.com/oauth/access_token';
    
    const oauthParams = {
      oauth_consumer_key: this.credentials.consumerKey,
      oauth_token: oauthToken,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: this.generateNonce(),
      oauth_version: '1.0',
      oauth_verifier: oauthVerifier
    };

    const signature = this.generateSignature('POST', accessTokenUrl, oauthParams, this.credentials.consumerSecret, requestTokenSecret);
    const authHeader = this.buildAuthHeader({ ...oauthParams, oauth_signature: signature });

    try {
      const response = await fetch(accessTokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.statusText}`);
      }

      const responseText = await response.text();
      const params = new URLSearchParams(responseText);
      
      const accessToken = params.get('oauth_token');
      const accessTokenSecret = params.get('oauth_token_secret');

      if (!accessToken || !accessTokenSecret) {
        throw new Error('Invalid access token response from Schoology');
      }

      // Store access tokens
      if (this.credentials) {
        this.credentials.accessToken = accessToken;
        this.credentials.accessTokenSecret = accessTokenSecret;
        await this.saveCredentials();
      }

      // Clean up request token secret
      localStorage.removeItem('schoology_request_token_secret');

    } catch (error) {
      console.error('Schoology OAuth callback failed:', error);
      throw error;
    }
  }

  // Get current user information
  async getCurrentUser(): Promise<SchoologyUser> {
    const response = await this.makeAuthenticatedRequest('GET', '/users/me');
    return response;
  }

  // Get user's courses
  async getCourses(): Promise<SchoologyCourse[]> {
    const response = await this.makeAuthenticatedRequest('GET', '/users/me/courses');
    return response.course || [];
  }

  // Get assignments for a specific course
  async getAssignments(courseId: string): Promise<SchoologyAssignment[]> {
    const response = await this.makeAuthenticatedRequest('GET', `/sections/${courseId}/assignments`);
    return response.assignment || [];
  }

  // Get course materials/content
  async getCourseMaterials(courseId: string): Promise<SchoologyMaterial[]> {
    const response = await this.makeAuthenticatedRequest('GET', `/sections/${courseId}/materials`);
    return response.material || [];
  }

  // Convert Schoology content to flashcards
  async convertToFlashcards(course: SchoologyCourse, assignments: SchoologyAssignment[], materials: SchoologyMaterial[]): Promise<{ question: string; answer: string }[]> {
    const allContent = [
      ...assignments.map(a => `${a.title}\n${a.description}`),
      ...materials.map(m => `${m.title}\n${m.description}\n${m.content}`)
    ].join('\n\n');

    // Use the existing AI service to convert Schoology content to flashcards
    const { generateFlashcards } = await import('../api/groqService');
    
    const cards = await generateFlashcards(allContent, { 
      userContext: `${course.title} - ${course.section_title}` 
    });
    
    return cards.map(card => ({
      question: card.question,
      answer: card.answer,
    }));
  }

  // Make authenticated API requests
  private async makeAuthenticatedRequest(method: string, endpoint: string, data?: any): Promise<any> {
    if (!this.credentials?.consumerKey || !this.credentials?.consumerSecret || 
        !this.credentials?.accessToken || !this.credentials?.accessTokenSecret) {
      throw new Error('Schoology not properly authenticated');
    }

    const url = `${this.baseUrl}${endpoint}`;
    const oauthParams = {
      oauth_consumer_key: this.credentials.consumerKey,
      oauth_token: this.credentials.accessToken,
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: this.generateNonce(),
      oauth_version: '1.0'
    };

    const signature = await this.generateSignature(method, url, oauthParams, this.credentials.consumerSecret, this.credentials.accessTokenSecret);
    const authHeader = this.buildAuthHeader({ ...oauthParams, oauth_signature: signature });

    const options: RequestInit = {
      method,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    };

    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`Schoology API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  // OAuth 1.0 signature generation
  private async generateSignature(method: string, url: string, params: any, consumerSecret: string, tokenSecret?: string): Promise<string> {
    // Sort parameters
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    // Create signature base string
    const signatureBaseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    
    // Create signing key
    const signingKey = `${encodeURIComponent(consumerSecret)}&${tokenSecret ? encodeURIComponent(tokenSecret) : ''}`;
    
    // Generate HMAC-SHA1 signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(signingKey);
    const messageData = encoder.encode(signatureBaseString);
    
    return crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    ).then(key => 
      crypto.subtle.sign('HMAC', key, messageData)
    ).then(signature => 
      btoa(String.fromCharCode(...new Uint8Array(signature)))
    ).then(b64 => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''))
    .catch(() => '');
  }

  // Build OAuth authorization header
  private buildAuthHeader(params: any): string {
    const headerParams = Object.keys(params)
      .sort()
      .map(key => `${key}="${encodeURIComponent(params[key])}"`)
      .join(', ');
    
    return `OAuth realm="Schoology API", ${headerParams}`;
  }

  // Generate nonce for OAuth
  private generateNonce(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  // Store credentials securely
  private async saveCredentials(): Promise<void> {
    try {
      const { requireSupabase } = await import('../database/supabase');
      const { data: { user } } = await requireSupabase().auth.getUser();
      
      if (!user) return;

      const metadata = user.user_metadata || {};
      const integrations = metadata.integrations || {};

      await requireSupabase().auth.updateUser({
        data: {
          user_metadata: {
            ...metadata,
            integrations: {
              ...integrations,
              schoology: {
                connected: true,
                consumerKey: this.credentials?.consumerKey,
                accessToken: this.credentials?.accessToken,
                // Note: Never store secrets in user metadata
                connectedAt: Date.now()
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Failed to save Schoology credentials:', error);
    }
  }

  // Load stored credentials
  private async loadStoredCredentials(): Promise<SchoologyCredentials | null> {
    try {
      const { requireSupabase } = await import('../database/supabase');
      const { data: { user } } = await requireSupabase().auth.getUser();
      
      if (!user) return null;

      const metadata = user.user_metadata || {};
      const integration = metadata.integrations?.schoology;
      
      if (!integration?.connected) return null;

      return {
        consumerKey: integration.consumerKey || process.env.VITE_SCHOOLOGY_CONSUMER_KEY || '',
        consumerSecret: process.env.VITE_SCHOOLOGY_CONSUMER_SECRET || '',
        accessToken: integration.accessToken,
        accessTokenSecret: '' // This should be stored securely server-side
      };
    } catch (error) {
      console.error('Failed to load Schoology credentials:', error);
      return null;
    }
  }

  // Disconnect from Schoology
  async disconnect(): Promise<void> {
    try {
      const { requireSupabase } = await import('../database/supabase');
      const { data: { user } } = await requireSupabase().auth.getUser();
      
      if (!user) return;

      const metadata = user.user_metadata || {};
      const integrations = metadata.integrations || {};

      await requireSupabase().auth.updateUser({
        data: {
          user_metadata: {
            ...metadata,
            integrations: {
              ...integrations,
              schoology: {
                connected: false,
                disconnectedAt: Date.now()
              }
            }
          }
        }
      });

      this.credentials = null;
    } catch (error) {
      console.error('Failed to disconnect Schoology:', error);
      throw error;
    }
  }

  // Check if connected
  isConnected(): boolean {
    return !!(this.credentials?.accessToken && this.credentials?.accessTokenSecret);
  }
}

export const schoologyService = new SchoologyService();
export type { SchoologyUser, SchoologyCourse, SchoologyAssignment, SchoologyMaterial, SchoologyCredentials };


