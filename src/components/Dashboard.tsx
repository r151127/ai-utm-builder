
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Download, Search, Filter, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Users, Globe } from 'lucide-react';

interface UTMLink {
  id: string;
  user_id: string | null;
  program: string;
  channel: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  code: string;
  domain: string;
  full_url: string;
  short_url: string;
  tracking_url: string;
  clicks: number;
  created_at: string;
  email: string | null;
  source: string;
}

interface UTMLinkWithEmail extends UTMLink {
  user_email: string;
}

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const [links, setLinks] = useState<UTMLinkWithEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filter states
  const [filters, setFilters] = useState({
    program: '',
    channel: '',
    source: '',
    dateFrom: '',
    dateTo: ''
  });

  const [showFilters, setShowFilters] = useState(false);

  const pageSize = 50;

  // Function to fetch user emails using the existing edge function
  const fetchUserEmails = useCallback(async (userIds: string[]): Promise<{ [key: string]: string }> => {
    try {
      console.log('Fetching user emails via edge function for:', userIds);
      
      const { data, error } = await supabase.functions.invoke('get-user-emails', {
        body: { userIds }
      });

      if (error) {
        console.error('Error calling get-user-emails function:', error);
        return {};
      }

      console.log('Email mapping received:', data?.emailMap);
      return data?.emailMap || {};
      
    } catch (error) {
      console.error('Error fetching user emails:', error);
      return {};
    }
  }, []);

  const loadLinks = useCallback(async (page = 1) => {
    if (loading && page === currentPage) {
      return; // Prevent multiple simultaneous requests
    }
    
    setLoading(true);
    setError('');

    try {
      let query = supabase
        .from('utm_links')
        .select('*', { count: 'exact' });

      // Apply user restriction for non-admin users
      if (!isAdmin && user?.id) {
        query = query.eq('user_id', user.id);
      }

      // Apply filters
      if (filters.program) {
        query = query.eq('program', filters.program);
      }
      if (filters.channel) {
        query = query.eq('channel', filters.channel);
      }
      if (filters.source) {
        query = query.eq('source', filters.source);
      }
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }

      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error: queryError, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (queryError) {
        console.error('Query error:', queryError);
        throw queryError;
      }

      const utmLinks = data || [];
      
      // Separate individual and bulk links
      const individualLinks = utmLinks.filter(link => link.source === 'individual' && link.user_id);
      const bulkLinks = utmLinks.filter(link => link.source === 'bulk' || !link.user_id);
      
      // Fetch user emails for individual links only
      const userIds = individualLinks.map(link => link.user_id).filter(Boolean);
      const emailMap = userIds.length > 0 ? await fetchUserEmails(userIds) : {};
      
      // Combine links with email data
      const linksWithEmails: UTMLinkWithEmail[] = utmLinks.map(link => ({
        ...link,
        user_email: link.source === 'bulk' || !link.user_id 
          ? (link.email || 'Bulk Import') 
          : (emailMap[link.user_id] || 'Unknown')
      }));

      setLinks(linksWithEmails);
      setTotalPages(Math.ceil((count || 0) / pageSize));
      setCurrentPage(page);
    } catch (err) {
      console.error('Error loading links:', err);
      setError(err instanceof Error ? err.message : 'Failed to load links');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.id, filters, fetchUserEmails, loading, currentPage]);

  // Initial load - only depend on auth state, not filters
  useEffect(() => {
    if (user !== undefined) { // Wait for auth to be determined
      loadLinks(1);
    }
  }, [isAdmin, user?.id]); // Remove filters and loadLinks from dependencies

  const handleFilter = useCallback(() => {
    setCurrentPage(1);
    loadLinks(1);
  }, [loadLinks]);

  const handlePageChange = useCallback((page: number) => {
    loadLinks(page);
  }, [loadLinks]);

  const exportToCSV = useCallback(() => {
    if (!links.length) return;

    const headers = ['Email', 'Source', 'Program', 'Channel', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Code/Name', 'Domain', 'TinyURL/Short URL', 'Tracking URL', 'Full URL', 'Clicks', 'Created At'];
    const csvContent = [
      headers.join(','),
      ...links.map(link => [
        link.user_email,
        link.source || 'individual',
        link.program,
        link.channel,
        link.utm_source,
        link.utm_medium,
        link.utm_campaign,
        link.code || '',
        link.domain || '',
        `"${link.short_url}"`,
        `"${link.tracking_url}"`,
        `"${link.full_url}"`,
        link.clicks,
        new Date(link.created_at).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utm-links-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [links]);

  const formatDate = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const getSourceIcon = useCallback((source: string) => {
    return source === 'bulk' ? <Globe className="w-4 h-4 text-blue-600" /> : <Users className="w-4 h-4 text-green-600" />;
  }, []);

  // Helper function to get the clickable URL for a link - Always use TinyURL (short_url)
  const getClickableUrl = useCallback((link: UTMLinkWithEmail) => {
    // Always use short_url (TinyURL) for both individual and bulk links
    return link.short_url;
  }, []);

  const refreshData = useCallback(() => {
    loadLinks(currentPage);
  }, [loadLinks, currentPage]);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">UTM Links Dashboard</h2>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </button>
            <button
              onClick={refreshData}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={exportToCSV}
              disabled={!links.length || loading}
              className="utm-button disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-gray-50 p-4 rounded-lg mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Program</label>
                <select
                  value={filters.program}
                  onChange={(e) => setFilters({ ...filters, program: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                >
                  <option value="">All Programs</option>
                  <option value="Academy">Academy</option>
                  <option value="Intensive">Intensive</option>
                  <option value="NIAT">NIAT</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
                <select
                  value={filters.channel}
                  onChange={(e) => setFilters({ ...filters, channel: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                >
                  <option value="">All Channels</option>
                  <option value="Affiliate">Affiliate</option>
                  <option value="Digital Marketing">Digital Marketing</option>
                  <option value="Influencer Marketing">Influencer Marketing</option>
                  <option value="Employee Referral">Employee Referral</option>
                  <option value="Invite & Earn">Invite & Earn</option>
                  <option value="NET">NET</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                <select
                  value={filters.source}
                  onChange={(e) => setFilters({ ...filters, source: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                >
                  <option value="">All Sources</option>
                  <option value="individual">Individual (Web App)</option>
                  <option value="bulk">Bulk (Sheet Import)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => {
                  setFilters({ program: '', channel: '', source: '', dateFrom: '', dateTo: '' });
                  setCurrentPage(1);
                  loadLinks(1);
                }}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleFilter}
                className="utm-button"
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Program</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Channel</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UTM Source</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UTM Medium</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UTM Campaign</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code/Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Domain</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">TinyURL</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clicks</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {links.map((link) => (
                    <tr key={link.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center">
                          {getSourceIcon(link.source || 'individual')}
                          <span className="ml-2 text-gray-900 capitalize">
                            {link.source === 'bulk' ? 'Bulk' : 'Individual'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{link.user_email}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{link.program}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{link.channel}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-mono">{link.utm_source}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-mono">{link.utm_medium}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-mono">{link.utm_campaign}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{link.code || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{link.domain || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <a
                          href={getClickableUrl(link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 inline-flex items-center"
                          title={`TinyURL that tracks clicks: ${getClickableUrl(link)}`}
                        >
                          {getClickableUrl(link).length > 50 ? `${getClickableUrl(link).substring(0, 50)}...` : getClickableUrl(link)}
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          link.clicks > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {link.clicks}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{formatDate(link.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || loading}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || loading}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </button>
              </div>
            </div>
          )}

          {links.length === 0 && !loading && (
            <div className="text-center py-12">
              <Search className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No links found</h3>
              <p className="mt-2 text-gray-500">
                {Object.values(filters).some(f => f) 
                  ? 'Try adjusting your filters or create your first UTM link.'
                  : 'Get started by creating your first UTM link.'
                }
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
