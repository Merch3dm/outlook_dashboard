import React, { useState, useEffect } from 'react';
import { Mail, Inbox, Star, Trash2, Archive, Send, Search, Filter, RefreshCw, Paperclip, LogIn, LogOut, Plus, X } from 'lucide-react';

const EmailDashboard = () => {
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [emails, setEmails] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddAccount, setShowAddAccount] = useState(false);

  // Microsoft Graph API Configuration
  const msalConfig = {
    auth: {
      clientId: '8ce8bd93-621c-43a1-8ea4-fe2faf2696f0', // Replace with your Azure App Client ID
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: window.location.origin
    }
  };

  const graphScopes = ['User.Read', 'Mail.Read'];

  const accountColors = [
    'from-blue-500 to-cyan-500',
    'from-purple-500 to-pink-500',
    'from-orange-500 to-red-500',
    'from-green-500 to-emerald-500'
  ];

  // Initialize and check for redirects
  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    // Load existing accounts from localStorage first
    const savedAccounts = localStorage.getItem('emailAccounts');
    let existingAccounts = [];
    if (savedAccounts) {
      existingAccounts = JSON.parse(savedAccounts);
      setAccounts(existingAccounts);
    }
    
    // Check if we just came back from Microsoft login
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      
      if (accessToken) {
        // Clean up the URL first
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Check if this account already exists
        try {
          const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          
          if (userResponse.ok) {
            const userData = await userResponse.json();
            const userEmail = userData.mail || userData.userPrincipalName;
            
            // Check if account already exists
            const accountExists = existingAccounts.some(acc => acc.email === userEmail);
            
            if (accountExists) {
              setError('This account is already added!');
              sessionStorage.removeItem('pendingAccountIndex');
              sessionStorage.removeItem('loginAttempt');
              // Still load emails for existing accounts
              if (existingAccounts.length > 0) {
                loadAllEmails(existingAccounts);
              }
              return;
            }
            
            // Add new account
            await addAccountWithToken(accessToken, existingAccounts.length, existingAccounts, userEmail);
          }
        } catch (err) {
          setError(`Error verifying account: ${err.message}`);
        }
        
        sessionStorage.removeItem('pendingAccountIndex');
        sessionStorage.removeItem('loginAttempt');
        return;
      }
    }
    
    // Load emails for existing accounts
    if (existingAccounts.length > 0) {
      loadAllEmails(existingAccounts);
    }
  };

  const addAccountWithToken = async (token, index, existingAccounts = [], userEmail = null) => {
    setLoading(true);
    setError('');

    try {
      // Fetch user profile if not already fetched
      let userData;
      if (!userEmail) {
        const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!userResponse.ok) throw new Error('Failed to fetch user profile');
        userData = await userResponse.json();
        userEmail = userData.mail || userData.userPrincipalName;
      }

      // Fetch emails from inbox
      const emailResponse = await fetch('https://graph.microsoft.com/v1.0/me/messages?$top=50&$orderby=receivedDateTime DESC', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!emailResponse.ok) throw new Error('Failed to fetch emails');
      const emailData = await emailResponse.json();

      // Create new account object
      const newAccount = {
        id: Date.now(), // Use timestamp as unique ID
        email: userEmail,
        token: token,
        color: accountColors[index % accountColors.length],
        unread: emailData.value.filter(e => !e.isRead).length,
        addedAt: new Date().toISOString()
      };

      // Format emails for display
      const formattedEmails = emailData.value.map((email) => ({
        id: `${newAccount.id}-${email.id}`,
        accountId: newAccount.id,
        accountEmail: newAccount.email,
        from: email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Unknown',
        subject: email.subject || '(No subject)',
        preview: email.bodyPreview || '',
        time: formatTime(email.receivedDateTime),
        unread: !email.isRead,
        starred: email.flag?.flagStatus === 'flagged',
        hasAttachment: email.hasAttachments,
        receivedDateTime: email.receivedDateTime
      }));

      // Update accounts list - merge with existing
      const updatedAccounts = [...existingAccounts, newAccount];
      setAccounts(updatedAccounts);
      
      // Save to localStorage
      localStorage.setItem('emailAccounts', JSON.stringify(updatedAccounts));

      // Update emails list - merge with existing
      const currentEmails = emails.length > 0 ? emails : [];
      const updatedEmails = [...currentEmails, ...formattedEmails].sort((a, b) => 
        new Date(b.receivedDateTime) - new Date(a.receivedDateTime)
      );
      setEmails(updatedEmails);

      setLoading(false);
      setShowAddAccount(false);
    } catch (err) {
      setError(`Error adding account: ${err.message}`);
      setLoading(false);
    }
  };

  const loadAllEmails = async (accountsList) => {
    setLoading(true);
    const allEmails = [];

    for (const account of accountsList) {
      try {
        const emailResponse = await fetch('https://graph.microsoft.com/v1.0/me/messages?$top=50&$orderby=receivedDateTime DESC', {
          headers: {
            'Authorization': `Bearer ${account.token}`
          }
        });

        if (emailResponse.ok) {
          const emailData = await emailResponse.json();
          
          const formattedEmails = emailData.value.map((email) => ({
            id: `${account.id}-${email.id}`,
            accountId: account.id,
            accountEmail: account.email,
            from: email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Unknown',
            subject: email.subject || '(No subject)',
            preview: email.bodyPreview || '',
            time: formatTime(email.receivedDateTime),
            unread: !email.isRead,
            starred: email.flag?.flagStatus === 'flagged',
            hasAttachment: email.hasAttachments,
            receivedDateTime: email.receivedDateTime
          }));

          allEmails.push(...formattedEmails);
          
          // Update unread count
          account.unread = formattedEmails.filter(e => e.unread).length;
        }
      } catch (err) {
        console.error(`Error loading emails for ${account.email}:`, err);
      }
    }

    // Sort all emails by date
    allEmails.sort((a, b) => new Date(b.receivedDateTime) - new Date(a.receivedDateTime));
    
    setEmails(allEmails);
    setAccounts([...accountsList]);
    setLoading(false);
  };

  const handleAddAccount = () => {
    if (accounts.length >= 4) {
      setError('Maximum 4 accounts allowed');
      return;
    }

    setLoading(true);
    setError('');
    
    // Store that we're attempting login and which account index
    sessionStorage.setItem('loginAttempt', 'true');
    sessionStorage.setItem('pendingAccountIndex', accounts.length.toString());
    
    // Build the authorization URL with prompt=select_account to force account selection
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${msalConfig.auth.clientId}&response_type=token&redirect_uri=${encodeURIComponent(msalConfig.auth.redirectUri)}&scope=${graphScopes.join('%20')}&response_mode=fragment&prompt=select_account`;
    
    // Redirect to Microsoft login
    window.location.href = authUrl;
  };

  const handleRemoveAccount = (accountId) => {
    const updatedAccounts = accounts.filter(acc => acc.id !== accountId);
    const updatedEmails = emails.filter(email => email.accountId !== accountId);
    
    setAccounts(updatedAccounts);
    setEmails(updatedEmails);
    
    // Update localStorage
    localStorage.setItem('emailAccounts', JSON.stringify(updatedAccounts));
    
    if (selectedAccount === accountId.toString()) {
      setSelectedAccount('all');
    }
  };

  const handleLogoutAll = () => {
    localStorage.removeItem('emailAccounts');
    setAccounts([]);
    setEmails([]);
    setSelectedAccount('all');
  };

  const refreshAllEmails = () => {
    if (accounts.length > 0) {
      loadAllEmails(accounts);
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const filteredEmails = emails.filter(email => {
    if (selectedAccount === 'all') return true;
    return email.accountId === parseInt(selectedAccount);
  }).filter(email => {
    if (!searchQuery) return true;
    return email.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
           email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
           email.accountEmail.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getAccountColor = (accountId) => {
    return accounts.find(acc => acc.id === accountId)?.color || 'from-gray-500 to-gray-600';
  };

  // If no accounts, show add account screen
  if (accounts.length === 0 && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-12 max-w-md w-full text-center shadow-2xl">
          <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Mail size={40} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Email Command Center</h1>
          <p className="text-purple-300 mb-8">Connect up to 4 Outlook accounts to get started</p>
          
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-6 text-red-200 text-sm">
              {error}
            </div>
          )}
          
          <button
            onClick={handleAddAccount}
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-purple-500/50 transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {loading ? (
              <>
                <RefreshCw size={20} className="animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Plus size={20} />
                Add First Account
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Email Command Center</h1>
            <p className="text-purple-300">Managing {accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex gap-3">
            {accounts.length < 4 && (
              <button
                onClick={handleAddAccount}
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-300 flex items-center gap-2 disabled:opacity-50"
              >
                <Plus size={20} />
                Add Account
              </button>
            )}
            <button
              onClick={handleLogoutAll}
              className="px-6 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all duration-300 flex items-center gap-2"
            >
              <LogOut size={20} />
              Logout All
            </button>
          </div>
        </div>

        {/* Account Pills */}
        {accounts.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-3">
            <button
              onClick={() => setSelectedAccount('all')}
              className={`px-6 py-3 rounded-full font-medium transition-all duration-300 ${
                selectedAccount === 'all'
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/50'
                  : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
              }`}
            >
              All Accounts ({accounts.reduce((sum, acc) => sum + acc.unread, 0)})
            </button>
            {accounts.map(account => (
              <div key={account.id} className="relative group">
                <button
                  onClick={() => setSelectedAccount(account.id.toString())}
                  className={`px-6 py-3 rounded-full font-medium transition-all duration-300 flex items-center gap-2 ${
                    selectedAccount === account.id.toString()
                      ? `bg-gradient-to-r ${account.color} text-white shadow-lg`
                      : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${account.color}`}></div>
                  <span className="max-w-[200px] truncate">{account.email}</span>
                  <span className="bg-white/30 px-2 py-0.5 rounded-full text-xs">{account.unread}</span>
                </button>
                <button
                  onClick={() => handleRemoveAccount(account.id)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600"
                >
                  <X size={14} className="text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Search and Controls */}
        <div className="mb-6 flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-purple-300" size={20} />
            <input
              type="text"
              placeholder="Search emails across all accounts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <button 
            onClick={refreshAllEmails}
            disabled={loading}
            className="px-6 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all duration-300 flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            Refresh All
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-200">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && emails.length === 0 && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
            <RefreshCw size={48} className="animate-spin text-purple-400 mx-auto mb-4" />
            <p className="text-purple-300">Loading your emails...</p>
          </div>
        )}

        {/* Email List */}
        {!loading && emails.length > 0 && (
          <>
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="divide-y divide-white/10">
                {filteredEmails.map(email => (
                  <div
                    key={email.id}
                    className={`p-5 hover:bg-white/10 transition-all duration-300 cursor-pointer group ${
                      email.unread ? 'bg-white/10 border-l-4 border-cyan-400' : 'bg-white/5 opacity-75'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Account Indicator */}
                      <div className={`w-1 h-full rounded-full bg-gradient-to-b ${getAccountColor(email.accountId)} flex-shrink-0 ${email.unread ? 'opacity-100' : 'opacity-50'}`}></div>
                      
                      {/* Unread Indicator Dot */}
                      {email.unread && (
                        <div className="mt-2 flex-shrink-0">
                          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                        </div>
                      )}
                      
                      {/* Star */}
                      <button className={`mt-1 flex-shrink-0 ${!email.unread && 'ml-3'}`}>
                        <Star
                          size={18}
                          className={email.starred ? 'fill-yellow-400 text-yellow-400' : 'text-purple-300 hover:text-yellow-400'}
                        />
                      </button>

                      {/* Email Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${email.unread ? 'text-white' : 'text-purple-300'}`}>
                              {email.from}
                            </span>
                            {email.unread && (
                              <span className="text-xs bg-cyan-400/20 text-cyan-300 px-2 py-0.5 rounded-full font-semibold">
                                NEW
                              </span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded ${email.unread ? 'bg-white/20 text-purple-200' : 'bg-white/10 text-purple-400'}`}>
                              {email.accountEmail}
                            </span>
                          </div>
                          <span className={`text-sm flex-shrink-0 ml-4 ${email.unread ? 'text-purple-200' : 'text-purple-400'}`}>{email.time}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`truncate ${email.unread ? 'text-white font-semibold' : 'text-purple-300 font-normal'}`}>
                            {email.subject}
                          </span>
                          {email.hasAttachment && (
                            <Paperclip size={14} className={`flex-shrink-0 ${email.unread ? 'text-purple-200' : 'text-purple-400'}`} />
                          )}
                        </div>
                        <p className={`text-sm truncate ${email.unread ? 'text-purple-200' : 'text-purple-400'}`}>{email.preview}</p>
                      </div>

                      {/* Quick Actions */}
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                          <Archive size={16} className="text-purple-300" />
                        </button>
                        <button className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                          <Trash2 size={16} className="text-purple-300" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats Footer */}
            <div className="mt-6 flex justify-between items-center text-purple-300 text-sm">
              <span>{filteredEmails.length} emails displayed</span>
              <span>{filteredEmails.filter(e => e.unread).length} unread</span>
            </div>
          </>
        )}

        {/* Empty State */}
        {!loading && emails.length === 0 && !error && accounts.length > 0 && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
            <Inbox size={48} className="text-purple-400 mx-auto mb-4" />
            <p className="text-purple-300">No emails found</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailDashboard;