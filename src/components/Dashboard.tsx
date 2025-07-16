import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Copy, ExternalLink, RefreshCw, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useAuth } from './AuthProvider';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface UTMAnalytics extends Tables<'utm_links'> {}

const Dashboard = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProgram, setFilterProgram] = useState('all');
  const [filterChannel, setFilterChannel] = useState('all');
  const [filterPlatform, setFilterPlatform] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const itemsPerPage = 20;
  const { toast } = useToast();
  const [utmAnalytics, setUtmAnalytics] = useState<UTMAnalytics[]>([]);

  // Calculate pagination range
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage - 1;
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const { data: utmLinksData, error, isLoading, refetch } = useQuery({
    queryKey: ['utmLinks', searchTerm, filterProgram, filterChannel, filterPlatform, filterSource, currentPage, user?.id, user?.email],
    queryFn: async () => {
      if (!user?.id) {
        console.log('No user ID available');
        return [];
      }

      // Check if user is admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      const isAdmin = !!roleData;
      console.log('User is admin:', isAdmin);

      // First, get the total count
      let countQuery = supabase
        .from('utm_links')
        .select('*', { count: 'exact', head: true });

      // Apply user-based filtering
      if (!isAdmin) {
        countQuery = countQuery.or(`user_id.eq.${user.id},and(user_id.is.null,email.eq.${user.email})`);
      }

      if (searchTerm) {
        countQuery = countQuery.ilike('email', `%${searchTerm}%`);
      }
      if (filterProgram !== 'all') {
        countQuery = countQuery.eq('program', filterProgram);
      }
      if (filterChannel !== 'all') {
        countQuery = countQuery.eq('channel', filterChannel);
      }
      if (filterPlatform !== 'all') {
        countQuery = countQuery.eq('platform', filterPlatform);
      }
      if (filterSource !== 'all') {
        countQuery = countQuery.eq('source', filterSource);
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      setTotalCount(count || 0);

      // Then get the paginated data
      let dataQuery = supabase
        .from('utm_links')
        .select('*')
        .order('created_at', { ascending: false })
        .range(startIndex, endIndex);

      // Apply user-based filtering for data query
      if (!isAdmin) {
        dataQuery = dataQuery.or(`user_id.eq.${user.id},and(user_id.is.null,email.eq.${user.email})`);
      }

      if (searchTerm) {
        dataQuery = dataQuery.ilike('email', `%${searchTerm}%`);
      }
      if (filterProgram !== 'all') {
        dataQuery = dataQuery.eq('program', filterProgram);
      }
      if (filterChannel !== 'all') {
        dataQuery = dataQuery.eq('channel', filterChannel);
      }
      if (filterPlatform !== 'all') {
        dataQuery = dataQuery.eq('platform', filterPlatform);
      }
      if (filterSource !== 'all') {
        dataQuery = dataQuery.eq('source', filterSource);
      }

      const { data, error: dataError } = await dataQuery;
      if (dataError) throw dataError;

      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (utmLinksData) {
      setUtmAnalytics(utmLinksData);
    }
  }, [utmLinksData]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterProgram, filterChannel, filterPlatform, filterSource]);

  if (error) {
    toast({
      title: "Error",
      description: "Failed to fetch UTM links",
      variant: "destructive",
    });
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "URL copied to clipboard.",
    });
  };

  const handleRefresh = () => {
    refetch();
    toast({
      title: "Refreshed!",
      description: "Data has been refreshed.",
    });
  };

  const exportToCSV = () => {
    if (!utmAnalytics.length) {
      toast({
        title: "No Data",
        description: "No data available to export.",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      'Created At', 'Source', 'Short URL', 'Clicks', 'Unique Clicks', 'Program', 'Channel', 
      'Platform', 'Placement', 'Email', 'UTM Source', 'UTM Medium', 'UTM Campaign',
      'CBA', 'Code', 'Domain'
    ];

    const csvContent = [
      headers.join(','),
      ...utmAnalytics.map(link => [
        `"${link.created_at ? new Date(link.created_at).toLocaleDateString() : ''}"`,
        `"${link.source || 'individual'}"`,
        `"${link.short_url}"`,
        link.clicks || 0,
        link.unique_clicks || 0,
        `"${link.program}"`,
        `"${link.channel}"`,
        `"${link.platform}"`,
        `"${link.placement}"`,
        `"${link.email || ''}"`,
        `"${link.utm_source}"`,
        `"${link.utm_medium}"`,
        `"${link.utm_campaign}"`,
        `"${link.cba || ''}"`,
        `"${link.code || ''}"`,
        `"${link.domain || ''}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `utm-links-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Exported!",
      description: "CSV file has been downloaded.",
    });
  };

  const getClicksColor = (clicks: number | null) => {
    const count = clicks || 0;
    if (count === 0) return 'text-gray-500';
    if (count <= 10) return 'text-orange-600 font-semibold';
    return 'text-green-600 font-bold';
  };

  const getProgramBadgeColor = (program: string) => {
    switch (program) {
      case 'Academy': return 'bg-blue-100 text-blue-800';
      case 'Intensive': return 'bg-green-100 text-green-800';
      case 'NIAT': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getChannelBadgeColor = (channel: string) => {
    switch (channel) {
      case 'Affiliate': return 'bg-pink-100 text-pink-800';
      case 'Digital Marketing': return 'bg-indigo-100 text-indigo-800';
      case 'Influencer Marketing': return 'bg-yellow-100 text-yellow-800';
      case 'Employee Referral': return 'bg-red-100 text-red-800';
      case 'Invite & Earn': return 'bg-teal-100 text-teal-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const currentRangeStart = startIndex + 1;
  const currentRangeEnd = Math.min(endIndex + 1, totalCount);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-2 text-gray-600">Manage your UTM links and track performance</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleRefresh}
              variant="outline"
              className="bg-white hover:bg-gray-50"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              onClick={exportToCSV}
              variant="outline"
              className="bg-white hover:bg-gray-50"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              onClick={() => setShowBulkImport(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Upload className="mr-2 h-4 w-4" />
              Bulk Import
            </Button>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex flex-col lg:flex-row gap-4 mb-4">
            <div className="flex-1">
              <Input
                placeholder="Search by email address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={filterProgram} onValueChange={setFilterProgram}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="Filter by Program" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Programs</SelectItem>
                <SelectItem value="Academy">Academy</SelectItem>
                <SelectItem value="Intensive">Intensive</SelectItem>
                <SelectItem value="NIAT">NIAT</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterChannel} onValueChange={setFilterChannel}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="Filter by Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="Affiliate">Affiliate</SelectItem>
                <SelectItem value="Digital Marketing">Digital Marketing</SelectItem>
                <SelectItem value="Influencer Marketing">Influencer Marketing</SelectItem>
                <SelectItem value="Employee Referral">Employee Referral</SelectItem>
                <SelectItem value="Invite & Earn">Invite & Earn</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="Filter by Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="YouTube">YouTube</SelectItem>
                <SelectItem value="Instagram">Instagram</SelectItem>
                <SelectItem value="Google">Google</SelectItem>
                <SelectItem value="Meta">Meta</SelectItem>
                <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                <SelectItem value="Facebook">Facebook</SelectItem>
                <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                <SelectItem value="Telegram">Telegram</SelectItem>
                <SelectItem value="Email">Email</SelectItem>
                <SelectItem value="Offline_Poster">Offline Poster</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="Filter by Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="bulk">Bulk</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results count */}
        <div className="mb-4 text-sm text-gray-600">
          {totalCount > 0 ? (
            <>Showing {currentRangeStart}-{currentRangeEnd} of {totalCount} links</>
          ) : (
            'No links found'
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center">
              <RefreshCw className="animate-spin mr-2 h-4 w-4" />
              Loading...
            </div>
          </div>
        ) : (
          <div className="dashboard-table">
            <Table>
              <TableCaption>A list of your UTM links with comprehensive tracking details.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Created</TableHead>
                  <TableHead className="w-[100px]">Source</TableHead>
                  <TableHead className="w-[180px]">Short URL</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                  <TableHead className="w-[80px]">Clicks</TableHead>
                  <TableHead className="w-[80px]">Unique Clicks</TableHead>
                  <TableHead className="w-[100px]">Program</TableHead>
                  <TableHead className="w-[120px]">Channel</TableHead>
                  <TableHead className="w-[100px]">Platform</TableHead>
                  <TableHead className="w-[100px]">Placement</TableHead>
                  <TableHead className="w-[150px]">Email</TableHead>
                  <TableHead className="w-[100px]">UTM Source</TableHead>
                  <TableHead className="w-[100px]">UTM Medium</TableHead>
                  <TableHead className="w-[120px]">UTM Campaign</TableHead>
                  <TableHead className="w-[80px]">CBA</TableHead>
                  <TableHead className="w-[80px]">Code</TableHead>
                  <TableHead className="w-[100px]">Domain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {utmAnalytics.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="text-sm font-medium">
                      {link.created_at ? new Date(link.created_at).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={link.source === 'bulk' ? 'secondary' : 'outline'}>
                        {link.source || 'individual'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <a 
                        href={link.short_url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                      >
                        {link.short_url.length > 30 ? link.short_url.substring(0, 30) + "..." : link.short_url}
                      </a>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          onClick={() => copyToClipboard(link.short_url)}
                          className="copy-button h-8 w-8"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <a href={link.short_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="icon" className="h-8 w-8">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={getClicksColor(link.clicks)}>
                        {link.clicks || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={getClicksColor(link.unique_clicks)}>
                        {link.unique_clicks || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={getProgramBadgeColor(link.program)}>
                        {link.program}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getChannelBadgeColor(link.channel)}>
                        {link.channel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{link.platform}</TableCell>
                    <TableCell className="text-sm">{link.placement}</TableCell>
                    <TableCell className="text-sm font-medium">{link.email || '-'}</TableCell>
                    <TableCell className="text-sm">{link.utm_source}</TableCell>
                    <TableCell className="text-sm">{link.utm_medium}</TableCell>
                    <TableCell className="text-sm">{link.utm_campaign}</TableCell>
                    <TableCell className="text-sm">{link.cba || '-'}</TableCell>
                    <TableCell className="text-sm">{link.code || '-'}</TableCell>
                    <TableCell className="text-sm">{link.domain || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="flex items-center gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          onClick={() => handlePageChange(pageNum)}
                          className="w-10 h-10"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-2"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
