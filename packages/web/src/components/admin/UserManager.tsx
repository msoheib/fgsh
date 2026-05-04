import React, { useState, useEffect } from 'react';
import { AdminService, formatGregorianDate, type AdminUser } from '@fakash/shared';
import { GradientButton } from '../GradientButton';
import { LoadingSpinner } from '../LoadingSpinner';
import toast from 'react-hot-toast';

const TIER_LABELS: Record<string, string> = {
  free: 'مجاني',
  basic: 'أساسي',
  premium: 'مميز',
};

export const UserManager: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned'>('all');
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await AdminService.getUsers();
      setUsers(data);
    } catch (error) {
      toast.error('فشل في تحميل المستخدمين');
    } finally {
      setLoading(false);
    }
  };

  const handleBanToggle = async (user: AdminUser) => {
    try {
      if (user.is_banned) {
        await AdminService.unbanUser(user.id);
        toast.success('تم إلغاء حظر المستخدم');
      } else {
        await AdminService.banUser(user.id);
        toast.success('تم حظر المستخدم');
      }
      loadUsers();
    } catch (error) {
      toast.error('حدث خطأ أثناء تحديث حالة المستخدم');
    }
  };

  const handleEditClick = (user: AdminUser) => {
    setEditingUser(user);
    setEditDisplayName(user.display_name || '');
  };

  const handleSaveDisplayName = async () => {
    if (!editingUser) return;

    try {
      await AdminService.updateUserDisplayName(editingUser.id, editDisplayName);
      toast.success('تم تحديث اسم المستخدم');
      setEditingUser(null);
      loadUsers();
    } catch (error) {
      toast.error('حدث خطأ أثناء التحديث');
    }
  };

  // Filter users
  const filteredUsers = users.filter((user) => {
    const matchesSearch = 
      !searchTerm ||
      user.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.id.includes(searchTerm);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'banned' && user.is_banned) ||
      (statusFilter === 'active' && !user.is_banned);

    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold">إدارة المستخدمين</h2>
        <button
          onClick={loadUsers}
          className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-colors"
        >
          🔄 تحديث
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="🔍 بحث بالاسم أو المعرف..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 glass px-4 py-3 rounded-xl text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-purple-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="glass px-4 py-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-500 bg-transparent"
        >
          <option value="all" className="bg-purple-900">جميع المستخدمين</option>
          <option value="active" className="bg-purple-900">النشطين</option>
          <option value="banned" className="bg-purple-900">المحظورين</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-2xl font-bold">{users.length}</p>
          <p className="text-white/60 text-sm">إجمالي المستخدمين</p>
        </div>
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{users.filter(u => !u.is_banned).length}</p>
          <p className="text-white/60 text-sm">النشطين</p>
        </div>
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{users.filter(u => u.is_banned).length}</p>
          <p className="text-white/60 text-sm">المحظورين</p>
        </div>
        <div className="glass rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-purple-400">{users.filter(u => u.is_admin).length}</p>
          <p className="text-white/60 text-sm">المسؤولين</p>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12 text-white/60">
          <p className="text-lg">لا يوجد مستخدمين مطابقين للبحث</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-right py-3 px-4 font-semibold text-white/70">المستخدم</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">الاشتراك</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">الألعاب</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">تاريخ الانضمام</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">الحالة</th>
                <th className="text-right py-3 px-4 font-semibold text-white/70">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr 
                  key={user.id} 
                  className={`border-b border-white/5 hover:bg-white/5 transition-colors ${
                    user.is_banned ? 'opacity-60' : ''
                  }`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold">
                        {(user.display_name || 'U')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold">{user.display_name || 'مستخدم'}</p>
                        <p className="text-white/40 text-xs truncate max-w-[150px]">{user.id}</p>
                        {user.is_admin && (
                          <span className="px-2 py-0.5 rounded bg-purple-500/30 text-purple-200 text-xs">
                            مسؤول {user.is_approved ? '✓' : '(بانتظار الموافقة)'}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded-lg text-sm ${
                      user.subscription_tier === 'premium' ? 'bg-purple-500/20 text-purple-200' :
                      user.subscription_tier === 'basic' ? 'bg-blue-500/20 text-blue-200' :
                      'bg-gray-500/20 text-gray-300'
                    }`}>
                      {TIER_LABELS[user.subscription_tier] || user.subscription_tier}
                    </span>
                    {user.is_paid_host && (
                      <span className="mr-2 text-yellow-400" title="مستخدم مدفوع">💰</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-white/80">
                    {user.games_created_count || 0}
                  </td>
                  <td className="py-3 px-4 text-white/60 text-sm">
                    {formatGregorianDate(user.created_at, { month: 'short' })}
                  </td>
                  <td className="py-3 px-4">
                    {user.is_banned ? (
                      <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-sm">
                        محظور
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-sm">
                        نشط
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditClick(user)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        title="تعديل"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleBanToggle(user)}
                        className={`p-2 rounded-lg transition-colors ${
                          user.is_banned 
                            ? 'hover:bg-green-500/20 text-green-400' 
                            : 'hover:bg-red-500/20 text-red-400'
                        }`}
                        title={user.is_banned ? 'إلغاء الحظر' : 'حظر'}
                      >
                        {user.is_banned ? '✅' : '🚫'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Display Name Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass max-w-md w-full rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4">تعديل اسم المستخدم</h3>
            
            <div className="mb-6">
              <label className="block text-white/70 mb-2">الاسم</label>
              <input
                type="text"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                className="w-full glass px-4 py-3 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-500"
                dir="rtl"
                placeholder="اكتب الاسم الجديد..."
              />
            </div>

            <div className="flex gap-3">
              <GradientButton variant="cyan" onClick={handleSaveDisplayName} className="flex-1">
                حفظ
              </GradientButton>
              <GradientButton 
                variant="purple" 
                onClick={() => setEditingUser(null)}
                className="flex-1"
              >
                إلغاء
              </GradientButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
