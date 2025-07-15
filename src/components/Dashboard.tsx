import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Copy, ExternalLink } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { BulkLinksFixer } from './BulkLinksFixer';

interface UTMAnalytics extends Tables<'utm_links'> {}

const Dashboard = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProgram, setFilterProgram] = useState('all');
  const [filterChannel, setFilterChannel] = useState('all');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const { toast } = useToast();
  const [utmAnalytics, setUtmAnalytics] = useState<UTMAnalytics[]>([]);

  const { data: utmLinksData, error, isLoading, refetch } = useQuery({
    queryKey: ['utmLinks', searchTerm, filterProgram, filterChannel],
    queryFn: async () => {
      let query = supabase
        .from('utm_links')
        .select('*')
        .order('created_at', { ascending: false });

      if (searchTerm) {
        query = query.ilike('full_url', `%${searchTerm}%`);
      }

      if (filterProgram !== 'all') {
        query = query.eq('program', filterProgram);
      }

      if (filterChannel !== 'all') {
        query = query.eq('channel', filterChannel);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Error fetching UTM links:", error);
        throw error;
      }
      return data;
    },
  });

  useEffect(() => {
    if (utmLinksData) {
      setUtmAnalytics(utmLinksData);
    }
  }, [utmLinksData]);

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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-2 text-gray-600">Manage your UTM links and track performance</p>
          </div>
          <Button
            onClick={() => setShowBulkImport(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Upload className="mr-2 h-4 w-4" />
            Bulk Import
          </Button>
        </div>

        {/* Add the BulkLinksFixer component */}
        <div className="mb-8">
          <BulkLinksFixer />
        </div>

        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1">
              <Input
                placeholder="Search by email, campaign, or URL..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={filterProgram} onValueChange={setFilterProgram}>
              <SelectTrigger className="w-full sm:w-48">
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
              <SelectTrigger className="w-full sm:w-48">
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
          </div>
        </div>

        {isLoading ? (
          <div className="text-center">Loading...</div>
        ) : (
          <Table>
            <TableCaption>A list of your UTM links.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Full URL</TableHead>
                <TableHead>Short URL</TableHead>
                <TableHead>Tracking URL</TableHead>
                <TableHead>Clicks</TableHead>
                <TableHead>Program</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {utmAnalytics.map((link) => (
                <TableRow key={link.id}>
                  <TableCell>
                    <a href={link.full_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {link.full_url.length > 50 ? link.full_url.substring(0, 50) + "..." : link.full_url}
                    </a>
                  </TableCell>
                  <TableCell>
                    <a href={link.short_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {link.short_url.length > 30 ? link.short_url.substring(0, 30) + "..." : link.short_url}
                    </a>
                  </TableCell>
                  <TableCell>
                    <a href={link.tracking_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {link.tracking_url.length > 30 ? link.tracking_url.substring(0, 30) + "..." : link.tracking_url}
                    </a>
                  </TableCell>
                  <TableCell>{link.clicks || 0}</TableCell>
                  <TableCell>{link.program}</TableCell>
                  <TableCell>{link.channel}</TableCell>
                  <TableCell>{link.email}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(link.short_url)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <a href={link.full_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="icon">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
