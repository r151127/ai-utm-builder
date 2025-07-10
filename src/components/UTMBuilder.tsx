
import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Copy, Check, ExternalLink, AlertCircle } from 'lucide-react';

const UTMBuilder = () => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    program: '',
    channel: '',
    platform: '',
    placement: '',
    landingPage: '',
    domain: '',
    cbaCode: '',
    codeName: ''
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    fullUrl: string;
    shortUrl: string;
    trackingUrl: string;
  } | null>(null);

  const [copiedField, setCopiedField] = useState<string>('');
  const [error, setError] = useState('');

  // Configuration data with real values from knowledge base
  const programs = ['Academy', 'Intensive', 'NIAT'];
  const channels = ['Affiliate', 'Digital Marketing', 'Influencer Marketing', 'Employee Referral', 'Invite & Earn', 'NET'];
  const platforms = ['YouTube', 'Instagram', 'Facebook', 'LinkedIn', 'Google', 'Meta', 'WhatsApp', 'Telegram', 'Email', 'Offline Poster'];

  const channelKeys: { [key: string]: string } = {
    'Affiliate': 'aff',
    'Digital Marketing': 'digmkt',
    'Influencer Marketing': 'ifmkt',
    'Employee Referral': 'empref',
    'Invite & Earn': 'invite',
    'NET': 'net'
  };

  const platformKeys: { [key: string]: string } = {
    'YouTube': 'yt',
    'Instagram': 'insta',
    'Facebook': 'fb',
    'LinkedIn': 'ln',
    'Google': 'google',
    'Meta': 'meta',
    'WhatsApp': 'wa',
    'Telegram': 'tg',
    'Email': 'email',
    'Offline Poster': 'poster'
  };

  // Real CTA placement values from knowledge base
  const platformPlacements: { [key: string]: string[] } = {
    'YouTube': ['Page Description', 'Video Description', 'Video End Button', 'Pin Comment', 'In Bio'],
    'Instagram': ['In Bio', 'Broadcast Channel', 'Story', 'Post', 'Reel', 'DM', 'Comment'],
    'Facebook': ['Comment', 'Page Description', 'In Bio', 'Story', 'Post'],
    'LinkedIn': ['cpc_message', 'cpc_conversation', 'cpc_image', 'cpc_video', 'cpc_carousel'],
    'Google': ['pmax', 'youtube', 'facebook', 'searchads', 'display', 'demandgen', 'nbsearch', 'brandsearch'],
    'Meta': ['instagram', 'fbinsta'],
    'WhatsApp': ['Message Copy'],
    'Telegram': ['Message Copy'],
    'Email': ['Email Body'],
    'Offline Poster': ['Poster Copy']
  };

  // Real landing page URLs from knowledge base
  const landingPages: { [key: string]: { [key: string]: string[] } } = {
    'Academy': {
      'Affiliate': ['https://accounts.ccbp.in/register/webinar-iitians-ccbp-4.0-academy-affiliate'],
      'Digital Marketing': ['https://www.ccbp.in/blueprint-softwarecareer', 'https://www.ccbp.in/academy/highpaid-job-dm', 'https://www.ccbp.in/academy/start-from-college'],
      'Influencer Marketing': ['https://accounts.ccbp.in/register/webinar-iitians-ccbp-4.0-academy-social-media'],
      'Employee Referral': ['https://accounts.ccbp.in/register/webinar-iitians-ccbp-4.0-academy-inbound'],
      'Invite & Earn': ['https://accounts.ccbp.in/register/academy-invite-and-earn'],
      'AI Workshop': ['https://accounts.ccbp.in/register/ai-workshop', 'https://www.ccbp.in/ai-workshop']
    },
    'Intensive': {
      'Affiliate': ['https://accounts.ccbp.in/register/ccbp-affiliate'],
      'Digital Marketing': ['https://nxtwave.ccbp.in/intensive-english'],
      'Influencer Marketing': ['https://www.fullstackdevelopercourse.co.in/nxtwave-intensive-demo', 'https://www.ccbp.in/intensive-new-v2', 'https://www.fullstackdevelopercourse.co.in/intensive-portal-experience', 'https://www.ccbp.in/intensive/instant-query-resolution', 'https://www.ccbp.in/intensive'],
      'Employee Referral': ['ccbp.in/intensive/referral'],
      'NET': ['https://www.ccbp.in/net']
    },
    'NIAT': {
      'Affiliate': ['https://apply.niatindia.com/login'],
      'Digital Marketing': ['https://apply.niatindia.com/login', 'https://www.niatindia.com/landing-page-dm'],
      'Influencer Marketing': ['https://apply.niatindia.com/login'],
      'Employee Referral': ['https://apply.niatindia.com/login', 'https://accounts.ccbp.in/register/niat-employee-referral'],
      'Invite & Earn': ['https://accounts.ccbp.in/public/register/niat-boot-camp', 'https://nxtrewards.ccbp.in']
    }
  };

  const handlePlatformChange = (platform: string) => {
    setFormData({ 
      ...formData, 
      platform, 
      placement: '' // Reset placement when platform changes
    });
  };

  const handleProgramChannelChange = (field: string, value: string) => {
    setFormData({ 
      ...formData, 
      [field]: value,
      landingPage: '' // Reset landing page when program or channel changes
    });
  };

  const generateUTMParams = () => {
    const channelKey = channelKeys[formData.channel];
    const platformKey = platformKeys[formData.platform];
    
    const utmSource = `${channelKey}-${platformKey}`;
    const utmMedium = formData.placement.toLowerCase().replace(/\s+/g, '_');
    
    let utmCampaign = `${channelKey}-${formData.program.toLowerCase()}`;
    if (formData.cbaCode) utmCampaign += `-${formData.cbaCode}`;
    if (formData.codeName) utmCampaign += `-${formData.codeName}`;

    return { utmSource, utmMedium, utmCampaign };
  };

  const generateShortUrl = async (fullUrl: string, customAlias?: string) => {
    try {
      const tinyUrlApi = 'https://tinyurl.com/api-create.php';
      const params = new URLSearchParams({
        url: fullUrl,
        ...(customAlias && { alias: customAlias })
      });

      const response = await fetch(`${tinyUrlApi}?${params}`);
      const shortUrl = await response.text();

      if (shortUrl.includes('Error') || shortUrl.includes('error')) {
        throw new Error(shortUrl);
      }

      return shortUrl;
    } catch (error) {
      throw new Error(`TinyURL Error: ${error}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    if (!user?.email) {
      setError('User email not found');
      setLoading(false);
      return;
    }

    try {
      // Generate UTM parameters
      const { utmSource, utmMedium, utmCampaign } = generateUTMParams();
      
      // Build full URL with UTM parameters
      const baseUrl = formData.landingPage;
      const urlParams = new URLSearchParams({
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign
      });
      
      const fullUrl = `${baseUrl}?${urlParams.toString()}`;

      // Generate short URL
      const shortUrl = await generateShortUrl(fullUrl, formData.domain || undefined);

      // Save to database first to get the ID
      const { data: linkData, error: dbError } = await supabase
        .from('utm_links')
        .insert({
          email: user.email,
          program: formData.program,
          channel: formData.channel,
          platform: formData.platform,
          placement: formData.placement,
          cba: formData.cbaCode,
          code: formData.codeName,
          domain: formData.domain,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          full_url: fullUrl,
          short_url: shortUrl,
          tracking_url: '', // Will be updated after we get the ID
          clicks: 0
        })
        .select()
        .single();

      if (dbError) throw dbError;

      if (!linkData) {
        throw new Error('Failed to save link to database');
      }

      // Generate tracking URL with the record ID
      const trackingUrl = `${window.location.origin}/api/track?id=${linkData.id}&url=${encodeURIComponent(shortUrl)}`;

      // Update the record with the tracking URL
      await supabase
        .from('utm_links')
        .update({ tracking_url: trackingUrl })
        .eq('id', linkData.id);

      setResult({
        fullUrl,
        shortUrl,
        trackingUrl
      });

    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(''), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const showCBACode = formData.program === 'Academy' && formData.channel === 'Influencer Marketing';
  const availablePlacements = platformPlacements[formData.platform] || [];
  const availableLandingPages = landingPages[formData.program]?.[formData.channel] || [];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="utm-form">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">UTM Link Builder</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-4 rounded-lg">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          )}

          {/* Program */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Program *
            </label>
            <select
              required
              value={formData.program}
              onChange={(e) => handleProgramChannelChange('program', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select Program</option>
              {programs.map(program => (
                <option key={program} value={program}>{program}</option>
              ))}
            </select>
          </div>

          {/* Channel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Channel *
            </label>
            <select
              required
              value={formData.channel}
              onChange={(e) => handleProgramChannelChange('channel', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select Channel</option>
              {channels.map(channel => (
                <option key={channel} value={channel}>{channel}</option>
              ))}
            </select>
          </div>

          {/* Hosting Platform */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Hosting Platform *
            </label>
            <select
              required
              value={formData.platform}
              onChange={(e) => handlePlatformChange(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select Platform</option>
              {platforms.map(platform => (
                <option key={platform} value={platform}>{platform}</option>
              ))}
            </select>
          </div>

          {/* CTA Placement */}
          {formData.platform && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CTA Placement *
              </label>
              <select
                required
                value={formData.placement}
                onChange={(e) => setFormData({ ...formData, placement: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select Placement</option>
                {availablePlacements.map(placement => (
                  <option key={placement} value={placement}>{placement}</option>
                ))}
              </select>
            </div>
          )}

          {/* Landing Page URL */}
          {formData.program && formData.channel && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Landing Page URL *
              </label>
              <select
                required
                value={formData.landingPage}
                onChange={(e) => setFormData({ ...formData, landingPage: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select Landing Page</option>
                {availableLandingPages.map(page => (
                  <option key={page} value={page}>{page}</option>
                ))}
              </select>
            </div>
          )}

          {/* Domain Name (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Domain Name (Optional)
            </label>
            <input
              type="text"
              value={formData.domain}
              onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Custom alias for short URL"
            />
          </div>

          {/* CBA Code (conditional) */}
          {showCBACode && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CBA Code
              </label>
              <input
                type="text"
                value={formData.cbaCode}
                onChange={(e) => setFormData({ ...formData, cbaCode: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter CBA code"
              />
            </div>
          )}

          {/* Code/Name (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Code/Name (Optional)
            </label>
            <input
              type="text"
              value={formData.codeName}
              onChange={(e) => setFormData({ ...formData, codeName: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter code or name"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="utm-button w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating...' : 'Generate UTM Link'}
          </button>
        </form>

        {/* Results */}
        {result && (
          <div className="mt-8 p-6 bg-green-50 rounded-lg border border-green-200">
            <h3 className="text-lg font-medium text-green-900 mb-4">Generated Links</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-green-700 mb-2">Full URL:</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={result.fullUrl}
                    readOnly
                    className="flex-1 px-3 py-2 bg-white border border-green-300 rounded text-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(result.fullUrl, 'full')}
                    className="copy-button"
                  >
                    {copiedField === 'full' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={result.fullUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="copy-button"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-green-700 mb-2">Short URL:</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={result.shortUrl}
                    readOnly
                    className="flex-1 px-3 py-2 bg-white border border-green-300 rounded text-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(result.shortUrl, 'short')}
                    className="copy-button"
                  >
                    {copiedField === 'short' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={result.shortUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="copy-button"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-green-700 mb-2">Tracking URL:</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={result.trackingUrl}
                    readOnly
                    className="flex-1 px-3 py-2 bg-white border border-green-300 rounded text-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(result.trackingUrl, 'tracking')}
                    className="copy-button"
                  >
                    {copiedField === 'tracking' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {copiedField && (
              <div className="mt-2 text-sm text-green-600">
                Copied to clipboard!
              </div>
            )}
          </div>
        )}

        {/* Bulk Mode Instructions */}
        <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="text-lg font-medium text-blue-900 mb-2">Bulk Mode</h3>
          <p className="text-blue-700 mb-4">
            For generating multiple links at once, use our Google Sheets template:
          </p>
          <a
            href="https://docs.google.com/spreadsheets/d/1J9vb53sgRzdLFiJ26MHdTYef_gOPl4PA9yybOlk7xtc/edit?gid=0#gid=0"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Open Google Sheets Template
          </a>
        </div>
      </div>
    </div>
  );
};

export default UTMBuilder;
