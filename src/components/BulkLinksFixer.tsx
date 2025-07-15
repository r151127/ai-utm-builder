
import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RotateCcw, CheckCircle, AlertCircle } from 'lucide-react';

export const BulkLinksFixer = () => {
  const [isFixing, setIsFixing] = useState(false);
  const [fixResults, setFixResults] = useState<any>(null);
  const { toast } = useToast();

  const handleFixBulkLinks = async () => {
    setIsFixing(true);
    setFixResults(null);

    try {
      console.log('Calling fix-bulk-links function...');
      
      const { data, error } = await supabase.functions.invoke('fix-bulk-links', {
        method: 'POST'
      });

      if (error) {
        console.error('Fix bulk links error:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to fix bulk links",
          variant: "destructive"
        });
        return;
      }

      console.log('Fix bulk links response:', data);
      setFixResults(data);

      if (data.success) {
        toast({
          title: "Success",
          description: `Fixed ${data.processed} bulk links for click tracking`,
          variant: "default"
        });
      } else {
        toast({
          title: "Warning", 
          description: data.message || "Some issues occurred while fixing bulk links",
          variant: "destructive"
        });
      }

    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5" />
          Fix Bulk Links Click Tracking
        </CardTitle>
        <CardDescription>
          Update existing bulk links to enable proper click tracking through TinyURL redirects
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            This will update TinyURLs for bulk-imported links to redirect through our tracking system, 
            enabling accurate click counting without affecting existing functionality.
          </p>
          
          <Button 
            onClick={handleFixBulkLinks} 
            disabled={isFixing}
            className="w-fit"
          >
            {isFixing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFixing ? 'Fixing Links...' : 'Fix Bulk Links'}
          </Button>
        </div>

        {fixResults && (
          <div className="mt-4 p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              {fixResults.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              )}
              <h4 className="font-semibold">Fix Results</h4>
            </div>
            
            {fixResults.summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                <div>
                  <div className="font-medium">Total Links</div>
                  <div className="text-muted-foreground">{fixResults.summary.total_links}</div>
                </div>
                <div>
                  <div className="font-medium">Fixed</div>
                  <div className="text-green-600">{fixResults.summary.fixed}</div>
                </div>
                <div>
                  <div className="font-medium">Already Tracking</div>
                  <div className="text-blue-600">{fixResults.summary.already_tracking}</div>
                </div>
                <div>
                  <div className="font-medium">Failed</div>
                  <div className="text-red-600">{fixResults.summary.failed}</div>
                </div>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              {fixResults.message}
            </p>

            {fixResults.errors && fixResults.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-medium text-red-600">Errors encountered:</p>
                <ul className="text-xs text-red-500 mt-1">
                  {fixResults.errors.slice(0, 5).map((error: any, idx: number) => (
                    <li key={idx}>
                      {error.email}: {error.error}
                    </li>
                  ))}
                  {fixResults.errors.length > 5 && (
                    <li>... and {fixResults.errors.length - 5} more errors</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
