import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import ProtectedRoute from '../../../../components/ProtectedRoute'
import { supabase } from '../../../../lib/supabase'
import { getCurrentUserProfile } from '../../../../lib/auth'
import type { MARForm, MARMedication, MARAdministration, MARPRNRecord, MARVitalSigns } from '../../../../types/mar'

export default function ViewMARForm() {
  const router = useRouter()
  const { id: patientId, marId } = router.query
  
  // Ensure marId is a string (can be array during SSR)
  const marFormId = Array.isArray(marId) ? marId[0] : marId
  const patientFormId = Array.isArray(patientId) ? patientId[0] : patientId
  const [marForm, setMarForm] = useState<MARForm | null>(null)
  const [medications, setMedications] = useState<MARMedication[]>([])
  const [administrations, setAdministrations] = useState<{ [medId: string]: { [day: number]: MARAdministration } }>({})
  const [prnRecords, setPrnRecords] = useState<MARPRNRecord[]>([])
  const [vitalSigns, setVitalSigns] = useState<{ [day: number]: MARVitalSigns }>({})
  const [staffInitials, setStaffInitials] = useState<{ [initials: string]: string }>({})
  const [dailyInitials, setDailyInitials] = useState<{ [day: number]: string }>({})
  const [dailySignatures, setDailySignatures] = useState<{ [day: number]: string }>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [userProfile, setUserProfile] = useState<any>(null)
  const [message, setMessage] = useState('')
  // Removed page navigation - everything shows in one table
  const [showAddMedModal, setShowAddMedModal] = useState(false)
  const [showAddPRNModal, setShowAddPRNModal] = useState(false)
  const [editingCell, setEditingCell] = useState<{ medId: string; day: number } | null>(null)

  useEffect(() => {
    // Wait for router to be ready
    if (!router.isReady) {
      setLoading(true)
      return
    }
    
    const formId = Array.isArray(router.query.marId) ? router.query.marId[0] : router.query.marId
    if (formId && typeof formId === 'string') {
      loadUserProfile()
      loadMARForm()
    } else if (router.isReady && !formId) {
      // Router is ready but no marId - set error
      setError('MAR form ID not found in URL')
      setLoading(false)
    }
  }, [router.isReady, router.query.marId])

  const loadUserProfile = async () => {
    const profile = await getCurrentUserProfile()
    setUserProfile(profile)
  }

  const updateAdministration = async (medId: string, day: number, status: string, initials: string = '') => {
    if (!userProfile || !isEditing || !marFormId) return
    
    try {
      setSaving(true)
      setError('')
      
      // Check if administration already exists
      const existingAdmin = administrations[medId]?.[day]
      
      if (status === 'Not Given' && !existingAdmin) {
        // Don't create a record for "Not Given" if it doesn't exist
        setSaving(false)
        return
      }

      if (existingAdmin) {
        // Update existing
        const { error } = await supabase
          .from('mar_administrations')
          .update({
            status,
            initials: initials || userProfile.staff_initials || '',
            administered_at: status === 'Given' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingAdmin.id)

        if (error) throw error
      } else {
        // Create new
        const { error } = await supabase
          .from('mar_administrations')
          .insert({
            mar_medication_id: medId,
            day_number: day,
            status,
            initials: initials || userProfile.staff_initials || '',
            administered_at: status === 'Given' ? new Date().toISOString() : null
          })

        if (error) throw error
      }

      // Refresh data
      const { data: adminData, error: adminError } = await supabase
        .from('mar_administrations')
        .select('*')
        .eq('mar_medication_id', medId)
        .eq('day_number', day)
        .single()

      if (!adminError && adminData) {
        setAdministrations(prev => ({
          ...prev,
          [medId]: {
            ...prev[medId],
            [day]: adminData
          }
        }))
      }

      setMessage('Administration record updated successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (err: any) {
      console.error('Error updating administration:', err)
      setError(err.message || 'Failed to update administration')
      setTimeout(() => setError(''), 5000)
    } finally {
      setSaving(false)
    }
  }

  const addPRNRecord = async (record: {
    date: string
    hour: string
    initials: string
    medication: string
    reason: string
    result: string
    staffSignature: string
  }) => {
    if (!userProfile || !marForm || !marFormId) return
    
    try {
      setSaving(true)
      const nextEntryNumber = prnRecords.length + 1

      const { error } = await supabase
        .from('mar_prn_records')
        .insert({
          mar_form_id: marFormId,
          date: record.date,
          hour: record.hour,
          initials: record.initials,
          medication: record.medication,
          reason: record.reason,
          result: record.result,
          staff_signature: record.staffSignature,
          entry_number: nextEntryNumber
        })

      if (error) throw error

      // Update staff initials legend
      setStaffInitials(prev => ({
        ...prev,
        [record.initials]: record.staffSignature
      }))

      await loadMARForm()
      setMessage('PRN record added successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to add PRN record')
      setTimeout(() => setError(''), 5000)
    } finally {
      setSaving(false)
    }
  }

  const addMedication = async (medData: {
    medicationName: string
    dosage: string
    startDate: string
    stopDate: string | null
    hour: string
    notes: string | null
    initials: string
  }) => {
    if (!userProfile || !marForm || !isEditing || !marFormId) return
    
    try {
      setSaving(true)
      setError('')
      
      // Insert medication
      const { data: newMed, error: medError } = await supabase
        .from('mar_medications')
        .insert({
          mar_form_id: marFormId,
          medication_name: medData.medicationName,
          dosage: medData.dosage,
          start_date: medData.startDate,
          stop_date: medData.stopDate,
          hour: medData.hour,
          notes: medData.notes
        })
        .select()
        .single()

      if (medError) throw medError

      // Populate initials for the START DATE of the medication
      // If start date is Nov 1, populate column 1
      // If start date is Nov 25, populate column 25
      // This is dynamic based on the start date the nurse selects
      
      // Parse the start date string directly to avoid timezone issues
      // Format: "YYYY-MM-DD" -> extract day number directly
      const startDateParts = medData.startDate.split('-')
      if (startDateParts.length === 3) {
        const startYear = parseInt(startDateParts[0], 10)
        const startMonth = parseInt(startDateParts[1], 10) - 1 // Month is 0-indexed in Date
        const startDay = parseInt(startDateParts[2], 10) // Day of month (1-31)
        
        // Get the form's month/year
        const formMonth = new Date(marForm.month_year + '-01')
        const formYear = formMonth.getFullYear()
        const formMonthIndex = formMonth.getMonth()
        
        // Check if start date is in the same month/year as the form
        if (startYear === formYear && startMonth === formMonthIndex) {
          // Validate that the day exists in this month (e.g., Feb doesn't have day 30)
          try {
            const testDate = new Date(formYear, formMonthIndex, startDay)
            if (testDate.getDate() === startDay && testDate.getMonth() === formMonthIndex) {
              // Create administration record for the start date only
              const { error: adminError } = await supabase
                .from('mar_administrations')
                .insert({
                  mar_medication_id: newMed.id,
                  day_number: startDay, // Use the parsed day directly
                  status: 'Given',
                  initials: medData.initials,
                  administered_at: new Date().toISOString()
                })

              if (adminError) {
                console.error('Error creating administration for start date:', adminError)
                // Don't throw - medication was created successfully
              }
            }
          } catch (e) {
            console.error('Invalid date for medication start:', e)
          }
        }
      }

      await loadMARForm()
      const displayDay = startDateParts.length === 3 ? parseInt(startDateParts[2], 10) : 'N/A'
      setMessage(`Medication added successfully! Initials "${medData.initials}" recorded for start date (day ${displayDay}).`)
      setTimeout(() => setMessage(''), 5000)
    } catch (err: any) {
      console.error('Error adding medication:', err)
      setError(err.message || 'Failed to add medication')
      setTimeout(() => setError(''), 5000)
    } finally {
      setSaving(false)
    }
  }

  const addVitals = async (vitalsData: {
    notes: string
    initials: string
    startDate: string
    stopDate: string | null
    hour: string
  }) => {
    if (!userProfile || !marForm || !isEditing || !marFormId) return
    
    try {
      setSaving(true)
      setError('')
      
      // Create a medication entry for vitals so it appears in the same table
      // Use a special naming convention to identify it as a vital sign entry
      const { data: newVital, error: vitalError } = await supabase
        .from('mar_medications')
        .insert({
          mar_form_id: marFormId,
          medication_name: 'VITALS',
          dosage: vitalsData.notes, // Store the vital sign instructions in dosage field
          start_date: vitalsData.startDate,
          stop_date: vitalsData.stopDate,
          hour: vitalsData.hour,
          notes: 'Vital Signs Entry' // Mark as vital sign entry
        })
        .select()
        .single()

      if (vitalError) throw vitalError

      // Populate initials for the START DATE of the vitals entry (same as medications)
      const startDateParts = vitalsData.startDate.split('-')
      if (startDateParts.length === 3 && vitalsData.initials) {
        const startYear = parseInt(startDateParts[0], 10)
        const startMonth = parseInt(startDateParts[1], 10) - 1
        const startDay = parseInt(startDateParts[2], 10)
        
        const formMonth = new Date(marForm.month_year + '-01')
        const formYear = formMonth.getFullYear()
        const formMonthIndex = formMonth.getMonth()
        
        // Check if start date is in the same month as the form
        if (startMonth === formMonthIndex && startYear === formYear) {
          // Create administration record for the start day
          await supabase
            .from('mar_administrations')
            .insert({
              mar_medication_id: newVital.id,
              day_number: startDay,
              status: 'Given',
              initials: vitalsData.initials.trim().toUpperCase(),
              administered_at: new Date().toISOString()
            })
        }
      }

      await loadMARForm()
      setMessage('Vital signs entry added successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (err: any) {
      console.error('Error adding vitals:', err)
      setError(err.message || 'Failed to add vitals')
      setTimeout(() => setError(''), 5000)
    } finally {
      setSaving(false)
    }
  }

  const updateVitalSigns = async (day: number, field: string, value: number | string) => {
    if (!userProfile || !marForm || !isEditing || !marFormId) return
    
    // Handle string fields (bowel_movement) differently from numeric fields
    const isStringField = field === 'bowel_movement'
    
    // For string fields, allow empty strings
    if (isStringField) {
      try {
        setSaving(true)
        const existing = vitalSigns[day]
        const updateData: any = {
          mar_form_id: marFormId,
          day_number: day,
          [field]: value || null
        }

        if (existing) {
          const { error } = await supabase
            .from('mar_vital_signs')
            .update(updateData)
            .eq('id', existing.id)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('mar_vital_signs')
            .insert(updateData)
          if (error) throw error
        }

        await loadMARForm()
      } catch (err: any) {
        console.error('Error updating vital signs:', err)
        setError(err.message || 'Failed to update vital signs')
        setTimeout(() => setError(''), 5000)
      } finally {
        setSaving(false)
      }
      return
    }
    
    // For numeric fields, handle as before
    const numValue = typeof value === 'string' ? parseFloat(value) : value
    if (!numValue || numValue === 0) {
      const existing = vitalSigns[day]
      if (existing) {
        try {
          setSaving(true)
          const updateData: any = {
            mar_form_id: marFormId,
            day_number: day,
            [field]: null
          }
          const { error } = await supabase
            .from('mar_vital_signs')
            .update(updateData)
            .eq('id', existing.id)
          if (error) throw error
          await loadMARForm()
        } catch (err: any) {
          console.error('Error updating vital signs:', err)
        } finally {
          setSaving(false)
        }
      }
      return
    }
    
    try {
      setSaving(true)
      const existing = vitalSigns[day]

      const updateData: any = {
        mar_form_id: marFormId,
        day_number: day,
        [field]: numValue
      }

      if (existing) {
        const { error } = await supabase
          .from('mar_vital_signs')
          .update(updateData)
          .eq('id', existing.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('mar_vital_signs')
          .insert(updateData)

        if (error) throw error
      }

      await loadMARForm()
    } catch (err: any) {
      console.error('Error updating vital signs:', err)
      setError(err.message || 'Failed to update vital signs')
      setTimeout(() => setError(''), 5000)
    } finally {
      setSaving(false)
    }
  }

  const loadMARForm = async () => {
    if (!marFormId || typeof marFormId !== 'string') return
    
    try {
      // Load MAR form
      const { data: formData, error: formError } = await supabase
        .from('mar_forms')
        .select('*')
        .eq('id', marFormId)
        .single()

      if (formError) throw formError
      if (!formData) {
        setError('MAR form not found')
        setLoading(false)
        return
      }
      setMarForm(formData)

      // Load medications
      const { data: medsData, error: medsError } = await supabase
        .from('mar_medications')
        .select('*')
        .eq('mar_form_id', marFormId)
        .order('created_at', { ascending: true })

      if (medsError) throw medsError
      setMedications(medsData || [])

      // Load administrations for all medications
      if (medsData && medsData.length > 0) {
        const medIds = medsData.map(m => m.id)
        const { data: adminData, error: adminError } = await supabase
          .from('mar_administrations')
          .select('*')
          .in('mar_medication_id', medIds)

        if (adminError) throw adminError

        // Organize by medication and day
        const adminMap: { [medId: string]: { [day: number]: MARAdministration } } = {}
        adminData?.forEach(admin => {
          if (!adminMap[admin.mar_medication_id]) {
            adminMap[admin.mar_medication_id] = {}
          }
          adminMap[admin.mar_medication_id][admin.day_number] = admin
        })
        setAdministrations(adminMap)
      }

      // Load PRN records
      const { data: prnData, error: prnError } = await supabase
        .from('mar_prn_records')
        .select('*')
        .eq('mar_form_id', marFormId)
        .order('entry_number', { ascending: true })

      if (prnError) throw prnError
      setPrnRecords(prnData || [])

      // Build staff initials legend from PRN records
      const initialsMap: { [initials: string]: string } = {}
      prnData?.forEach(prn => {
        if (prn.initials && prn.staff_signature) {
          initialsMap[prn.initials] = prn.staff_signature
        }
      })
      setStaffInitials(initialsMap)

      // Load vital signs
      const { data: vsData, error: vsError } = await supabase
        .from('mar_vital_signs')
        .select('*')
        .eq('mar_form_id', marFormId)

      if (vsError) throw vsError

      const vsMap: { [day: number]: MARVitalSigns } = {}
      vsData?.forEach(vs => {
        vsMap[vs.day_number] = vs
      })
      setVitalSigns(vsMap)

      setLoading(false)
    } catch (err: any) {
      console.error('Error loading MAR form:', err)
      setError(err.message || 'Failed to load MAR form')
      setLoading(false)
    }
  }

  const days = Array.from({ length: 31 }, (_, i) => i + 1)

  // Show loading state while router is initializing
  if (!router.isReady || loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading MAR form...</p>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  // Show error state
  if (error && !marForm) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            <button 
              onClick={() => {
                if (patientFormId) {
                  router.push(`/patients/${patientFormId}/forms`)
                } else {
                  router.push('/dashboard')
                }
              }} 
              className="px-4 py-2 bg-blue-600 text-white rounded-md"
            >
              {patientFormId ? 'Back to Patient Forms' : 'Go to Dashboard'}
            </button>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  // Show not found if no marForm after loading
  if (!marForm && !loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-4">MAR form not found</p>
            <button 
              onClick={() => {
                if (patientFormId) {
                  router.push(`/patients/${patientFormId}/forms`)
                } else {
                  router.push('/dashboard')
                }
              }} 
              className="px-4 py-2 bg-blue-600 text-white rounded-md"
            >
              {patientFormId ? 'Back to Patient Forms' : 'Go to Dashboard'}
            </button>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  if (!marForm) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <Head>
        <title>MAR Form - {marForm.month_year} - Chartbuddies</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header Navigation */}
          <div className="mb-6">
            <button
              onClick={() => router.push(`/patients/${patientFormId}/forms`)}
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 text-sm mb-4"
            >
              ← Back to Patient Forms
            </button>
            <div className="flex justify-between items-center">
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white">
                Medication Administration Record (MAR)
              </h1>
              <div className="flex space-x-3">
                <button
                  onClick={() => router.push(`/patients/${patientFormId}/mar/new`)}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  + Add New MAR Form
                </button>
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={`px-4 py-2 rounded-md ${
                    isEditing 
                      ? 'bg-gray-600 text-white hover:bg-gray-700' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isEditing ? 'Cancel Editing' : 'Edit Form'}
                </button>
              </div>
            </div>
          </div>


          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {message && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
              <p className="text-green-800 dark:text-green-200">{message}</p>
            </div>
          )}

          {isEditing && (
            <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
              <p className="text-blue-800 dark:text-blue-200 font-semibold">
                ✏️ Edit Mode: Click on medication cells to mark administrations. Changes save automatically.
              </p>
            </div>
          )}

          {/* Medication and Vitals Administration Grid */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              {/* Form Header */}
              <div className="mb-6 border-b-2 border-gray-300 dark:border-gray-600 pb-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-4">
                    <span className="text-2xl">T</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={marForm.month_year}
                        onChange={(e) => {
                          // Update month_year
                          supabase
                            .from('mar_forms')
                            .update({ month_year: e.target.value })
                            .eq('id', marFormId)
                          setMarForm({ ...marForm, month_year: e.target.value })
                        }}
                        placeholder="MO/YR"
                        className="px-2 py-1 border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    ) : (
                      <span className="text-lg font-medium">{marForm.month_year}</span>
                    )}
                  </div>
                  <div>
                    {isEditing ? (
                      <input
                        type="text"
                        value={marForm.facility_name || ''}
                        onChange={(e) => {
                          supabase
                            .from('mar_forms')
                            .update({ facility_name: e.target.value })
                            .eq('id', marFormId)
                          setMarForm({ ...marForm, facility_name: e.target.value })
                        }}
                        placeholder="Facility Name:"
                        className="px-2 py-1 border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    ) : (
                      <span className="text-lg font-medium">Facility Name: {marForm.facility_name || 'N/A'}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Medication Administration Table */}
              <div className="mb-6 overflow-x-auto">
                <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300" style={{ minWidth: '200px' }}>
                        Medication
                      </th>
                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-xs font-medium text-gray-700 dark:text-gray-300" style={{ minWidth: '120px' }}>
                        Start/Stop Date
                      </th>
                      <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-xs font-medium text-gray-700 dark:text-gray-300" style={{ minWidth: '80px' }}>
                        Hour
                      </th>
                      {/* Days 1-31 */}
                      {days.map(day => (
                        <th
                          key={day}
                          className="border border-gray-300 dark:border-gray-600 px-1 py-2 text-center text-xs font-medium text-gray-700 dark:text-gray-300"
                          style={{ minWidth: '40px', width: '40px' }}
                        >
                          {day}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {medications.length === 0 ? (
                      <tr>
                        <td colSpan={34} className="border border-gray-300 dark:border-gray-600 px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          {isEditing ? 'No medications. Click "+ Add Medication" below to add one.' : 'No medications recorded'}
                        </td>
                      </tr>
                    ) : (
                      medications.map((med) => {
                        const medAdmin = administrations[med.id] || {}
                        const isVitalsEntry = med.medication_name === 'VITALS' || med.notes === 'Vital Signs Entry'
                        return (
                          <tr key={med.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${isVitalsEntry ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                            {/* Medication Name & Dosage */}
                            <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 align-top">
                              <div className={`font-medium text-sm ${isVitalsEntry ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-white'}`}>
                                {isVitalsEntry ? '📊 VITALS' : med.medication_name}
                              </div>
                              <div className={`text-xs mt-1 ${isVitalsEntry ? 'text-blue-600 dark:text-blue-400 italic' : 'text-gray-600 dark:text-gray-400'}`}>
                                {isVitalsEntry ? med.dosage : med.dosage}
                              </div>
                              {med.notes && !isVitalsEntry && (
                                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 italic">
                                  {med.notes}
                                </div>
                              )}
                            </td>
                            {/* Start/Stop Date */}
                            <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 align-top text-center text-xs">
                              <div>Start: {new Date(med.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                              {med.stop_date && (
                                <div>Stop: {new Date(med.stop_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                              )}
                            </td>
                            {/* Hour */}
                            <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 align-top text-center text-xs">
                              {isVitalsEntry ? '—' : (med.hour || 'N/A')}
                            </td>
                            {/* Days 1-31 */}
                            {days.map(day => {
                              const admin = medAdmin[day]
                              const status = admin?.status || 'Not Given'
                              const initials = admin?.initials || ''
                              const isNotGiven = status === 'Not Given'
                              const isGiven = status === 'Given'
                              const isPRN = status === 'PRN'

                              // Check if medication is active on this day
                              // For vitals entries, always make them active
                              // For medications, check start/stop dates
                              
                              let isMedActive = false
                              
                              if (isVitalsEntry) {
                                // Vitals entries are always active for all days
                                isMedActive = true
                              } else {
                                // Regular medication logic
                                // Columns 1-31 represent the day of the month (1st, 2nd, 3rd... 31st)
                                // If medication starts on Nov 1, it's active from column 1 onwards
                                // If medication starts on Nov 15, it's active from column 15 onwards
                                
                                const medStartDate = new Date(med.start_date)
                                const medStopDate = med.stop_date ? new Date(med.stop_date) : null
                                
                                // Get the form's month/year
                                const formMonth = new Date(marForm.month_year + '-01')
                                const formYear = formMonth.getFullYear()
                                const formMonthIndex = formMonth.getMonth()
                                
                                // Get the day of month when medication starts (1-31)
                                const startDayOfMonth = medStartDate.getDate()
                                
                                // Check if start date is in the same month as the form
                                const isStartInFormMonth = medStartDate.getMonth() === formMonthIndex && medStartDate.getFullYear() === formYear
                                
                                // Medication is active if:
                                // 1. It starts in this form's month, AND
                                // 2. Current day (column number) >= start day of month, AND
                                // 3. (No stop date OR stop date is after current day)
                                
                                if (isStartInFormMonth) {
                                  // Create date for current column day in form's month
                                  try {
                                    const currentDayDate = new Date(formYear, formMonthIndex, day)
                                    // Check if this is a valid date (handles months with < 31 days)
                                    if (currentDayDate.getDate() === day && currentDayDate.getMonth() === formMonthIndex) {
                                      // Active if day >= start day
                                      if (day >= startDayOfMonth) {
                                        // Check stop date if it exists
                                        if (!medStopDate || currentDayDate <= medStopDate) {
                                          isMedActive = true
                                        }
                                      }
                                    }
                                  } catch (e) {
                                    // Invalid date (e.g., Feb 30)
                                    isMedActive = false
                                  }
                                }
                              }

                              return (
                                <td
                                  key={day}
                                  className={`border border-gray-300 dark:border-gray-600 px-1 py-2 text-center text-xs ${
                                    isEditing && isMedActive ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20' : ''
                                  } ${!isMedActive ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                                  onDoubleClick={isEditing && isMedActive && !isVitalsEntry ? () => {
                                    // Double-click to mark as not given (circled) - only for medications, not vitals
                                    if (isGiven) {
                                      updateAdministration(med.id, day, 'Not Given', initials)
                                    }
                                  } : undefined}
                                  title={isEditing && isMedActive ? (isVitalsEntry ? 'Click to add initials for vital signs' : 'Click to add initials, Double-click to mark as not given') : !isMedActive ? (isVitalsEntry ? 'Vital signs entry' : 'Medication not active on this day') : ''}
                                >
                                  {isMedActive ? (
                                    <>
                                      {isEditing && (editingCell?.medId === med.id && editingCell?.day === day) ? (
                                        <input
                                          type="text"
                                          autoFocus
                                          value={initials}
                                          onBlur={async (e) => {
                                            const enteredInitials = e.target.value.trim().toUpperCase()
                                            if (enteredInitials) {
                                              await updateAdministration(med.id, day, 'Given', enteredInitials)
                                            } else {
                                              // If empty, don't create a record
                                              setEditingCell(null)
                                            }
                                            setEditingCell(null)
                                          }}
                                          onKeyDown={async (e) => {
                                            if (e.key === 'Enter') {
                                              const enteredInitials = (e.target as HTMLInputElement).value.trim().toUpperCase()
                                              if (enteredInitials) {
                                                await updateAdministration(med.id, day, 'Given', enteredInitials)
                                              }
                                              setEditingCell(null)
                                            } else if (e.key === 'Escape') {
                                              setEditingCell(null)
                                            }
                                          }}
                                          placeholder={userProfile?.staff_initials || "Initials"}
                                          maxLength={4}
                                          className="w-full text-center text-xs font-bold border-2 border-blue-500 rounded px-1 py-1 dark:bg-gray-700 dark:text-white"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      ) : (
                                        <div
                                          onClick={isEditing ? () => setEditingCell({ medId: med.id, day }) : undefined}
                                          className={`min-h-[24px] flex items-center justify-center ${
                                            isEditing ? 'cursor-text hover:bg-blue-50 dark:hover:bg-blue-900/20' : ''
                                          }`}
                                        >
                                          {isGiven && (
                                            <div className={`font-bold text-gray-800 dark:text-white ${isEditing ? 'cursor-text' : ''}`}>
                                              {initials || '—'}
                                            </div>
                                          )}
                                          {isNotGiven && initials && (
                                            <div className="text-red-600 dark:text-red-400 font-bold">
                                              ○{initials}
                                            </div>
                                          )}
                                          {isPRN && (
                                            <div className="text-blue-600 dark:text-blue-400 font-bold text-xs">
                                              PRN
                                              {initials && <div className="text-xs">{initials}</div>}
                                            </div>
                                          )}
                                          {isNotGiven && !initials && isEditing && (
                                            <div className="text-gray-400 cursor-text">—</div>
                                          )}
                                          {isNotGiven && !initials && !isEditing && (
                                            <div className="text-gray-400">—</div>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
                {isEditing && (
                  <button
                    onClick={() => setShowAddMedModal(true)}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    + Add Medication
                  </button>
                )}
              </div>

              {/* Bottom Section: Patient Info & Instructions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 border-t-2 border-gray-300 dark:border-gray-600 pt-6">
                {/* Left Column: Patient Information */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Diagnosis:</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={marForm.diagnosis || ''}
                        onChange={(e) => {
                          supabase.from('mar_forms').update({ diagnosis: e.target.value }).eq('id', marFormId)
                          setMarForm({ ...marForm, diagnosis: e.target.value })
                        }}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    ) : (
                      <div className="text-sm text-gray-800 dark:text-white">{marForm.diagnosis || 'N/A'}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Allergies:</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={marForm.allergies || ''}
                        onChange={(e) => {
                          supabase.from('mar_forms').update({ allergies: e.target.value }).eq('id', marFormId)
                          setMarForm({ ...marForm, allergies: e.target.value })
                        }}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    ) : (
                      <div className="text-sm text-gray-800 dark:text-white">{marForm.allergies || 'None'}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">NAME:</label>
                    <div className="text-sm font-medium text-gray-800 dark:text-white">{marForm.patient_name}</div>
                  </div>
                </div>

                {/* Middle Column: Diet & Physician */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      DIET (Special Instructions, e.g. Texture, Bite Size, Position, etc.):
                    </label>
                    {isEditing ? (
                      <textarea
                        value={marForm.diet || ''}
                        onChange={(e) => {
                          supabase.from('mar_forms').update({ diet: e.target.value }).eq('id', marFormId)
                          setMarForm({ ...marForm, diet: e.target.value })
                        }}
                        rows={3}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    ) : (
                      <div className="text-sm text-gray-800 dark:text-white">{marForm.diet || 'N/A'}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Physician Name:</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={marForm.physician_name || ''}
                        onChange={(e) => {
                          supabase.from('mar_forms').update({ physician_name: e.target.value }).eq('id', marFormId)
                          setMarForm({ ...marForm, physician_name: e.target.value })
                        }}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    ) : (
                      <div className="text-sm text-gray-800 dark:text-white">{marForm.physician_name || 'N/A'}</div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number:</label>
                    {isEditing ? (
                      <input
                        type="tel"
                        value={marForm.physician_phone || ''}
                        onChange={(e) => {
                          supabase.from('mar_forms').update({ physician_phone: e.target.value }).eq('id', marFormId)
                          setMarForm({ ...marForm, physician_phone: e.target.value })
                        }}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                      />
                    ) : (
                      <div className="text-sm text-gray-800 dark:text-white">{marForm.physician_phone || 'N/A'}</div>
                    )}
                  </div>
                </div>

                {/* Right Column: Comments & Instructions */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Comments:</label>
                    <div className="text-sm text-gray-800 dark:text-white min-h-[60px] p-2 border border-gray-200 dark:border-gray-600 rounded">
                      {/* Comments can be added via notes or PRN records */}
                      <span className="text-gray-400 italic">See PRN records section for notes</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
                    <div><strong>Instructions:</strong></div>
                    <div>A. Put initials in appropriate box when medication is given.</div>
                    <div>B. Circle initials when not given.</div>
                    <div>C. State reason for refusal / omission on back of form.</div>
                    <div>D. PRN Medications: Reason given and results must be noted on back of form.</div>
                    <div>E. Legend: S=School; H = Home visit; W = Work; P = Program</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <label className="block text-gray-700 dark:text-gray-300 mb-1">Record #:</label>
                      <div className="text-gray-800 dark:text-white">{marForm.record_number}</div>
                    </div>
                    <div>
                      <label className="block text-gray-700 dark:text-gray-300 mb-1">Date of Birth:</label>
                      <div className="text-gray-800 dark:text-white">{new Date(marForm.date_of_birth).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <label className="block text-gray-700 dark:text-gray-300 mb-1">Sex:</label>
                      <div className="text-gray-800 dark:text-white">{marForm.sex}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

        </div>
      </div>

      {/* Add Medication/Vitals Modal */}
      {showAddMedModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddMedModal(false)
            }
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">Add Medication or Vitals</h2>
              <button
                onClick={() => setShowAddMedModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <AddMedicationOrVitalsForm
              onSubmit={async (data) => {
                try {
                  if (data.type === 'medication') {
                    await addMedication(data.medicationData!)
                  } else {
                    await addVitals(data.vitalsData!)
                  }
                  setShowAddMedModal(false)
                } catch (err) {
                  console.error('Error adding entry:', err)
                }
              }}
              onCancel={() => setShowAddMedModal(false)}
              defaultStartDate={new Date().toISOString().split('T')[0]}
              defaultHour={new Date().toTimeString().slice(0, 5)}
              defaultInitials={userProfile?.staff_initials || ''}
            />
          </div>
        </div>
      )}

      {/* Add PRN Record Modal - Hidden but kept for future use */}
      {/* Uncomment below to restore PRN functionality */}
      {/*
      {showAddPRNModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddPRNModal(false)
            }
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">Add PRN Record</h2>
              <button
                onClick={() => setShowAddPRNModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <AddPRNRecordForm
              onSubmit={async (prnData) => {
                try {
                  await addPRNRecord(prnData)
                  setShowAddPRNModal(false)
                } catch (err) {
                  console.error('Error adding PRN record:', err)
                }
              }}
              onCancel={() => setShowAddPRNModal(false)}
              defaultDate={new Date().toISOString().split('T')[0]}
              defaultHour={new Date().toTimeString().slice(0, 5)}
              defaultInitials={userProfile?.staff_initials || ''}
              defaultSignature={userProfile?.full_name || ''}
            />
          </div>
        </div>
      )}
      */}
    </ProtectedRoute>
  )
}

// Add Medication or Vitals Form Component
function AddMedicationOrVitalsForm({ 
  onSubmit, 
  onCancel,
  defaultStartDate,
  defaultHour,
  defaultInitials
}: { 
  onSubmit: (data: {
    type: 'medication' | 'vitals'
    medicationData?: {
      medicationName: string
      dosage: string
      startDate: string
      stopDate: string | null
      hour: string
      notes: string | null
      initials: string
    }
    vitalsData?: {
      notes: string
      initials: string
      startDate: string
      stopDate: string | null
      hour: string
    }
  }) => Promise<void>
  onCancel: () => void
  defaultStartDate: string
  defaultHour: string
  defaultInitials: string
}) {
  const [entryType, setEntryType] = useState<'medication' | 'vitals'>('medication')
  const [initialsType, setInitialsType] = useState<'initials' | 'legend'>('initials')
  const [selectedLegend, setSelectedLegend] = useState<string>('')
  const [vitalsInitialsType, setVitalsInitialsType] = useState<'initials' | 'legend'>('initials')
  const [selectedVitalsLegend, setSelectedVitalsLegend] = useState<string>('')
  const [medicationData, setMedicationData] = useState({
    medicationName: '',
    dosage: '',
    startDate: defaultStartDate,
    stopDate: '',
    hour: defaultHour,
    notes: '',
    initials: defaultInitials
  })
  const [vitalsData, setVitalsData] = useState({
    notes: '',
    initials: defaultInitials,
    startDate: defaultStartDate,
    stopDate: '',
    hour: defaultHour
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Default legends for MAR forms
  const defaultLegends = [
    { code: 'MC', description: 'Medication Discontinued' },
    { code: 'G', description: 'Given' },
    { code: 'NG', description: 'Not Given' },
    { code: 'PRN', description: 'As Needed' },
    { code: 'H', description: 'Held' },
    { code: 'R', description: 'Refused' }
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (entryType === 'medication') {
      if (!medicationData.medicationName || !medicationData.dosage || !medicationData.startDate || !medicationData.hour) {
        alert('Please fill in all required fields')
        return
      }
      // Validate initials/legend selection
      if (initialsType === 'initials' && !medicationData.initials.trim()) {
        alert('Please enter initials or select a legend')
        return
      }
      if (initialsType === 'legend' && !selectedLegend) {
        alert('Please select a legend code')
        return
      }
    } else {
      if (!vitalsData.notes.trim() || !vitalsData.startDate || !vitalsData.hour) {
        alert('Please fill in all required fields')
        return
      }
      // Validate vitals initials/legend selection
      if (vitalsInitialsType === 'initials' && !vitalsData.initials.trim()) {
        alert('Please enter initials or select a legend')
        return
      }
      if (vitalsInitialsType === 'legend' && !selectedVitalsLegend) {
        alert('Please select a legend code')
        return
      }
    }

    setIsSubmitting(true)
    try {
      // Determine the final initials value based on selection
      const finalInitials = initialsType === 'initials' 
        ? medicationData.initials.trim().toUpperCase()
        : selectedLegend

      // Determine the final vitals initials value based on selection
      const finalVitalsInitials = vitalsInitialsType === 'initials'
        ? vitalsData.initials.trim().toUpperCase()
        : selectedVitalsLegend

      await onSubmit({
        type: entryType,
        medicationData: entryType === 'medication' ? {
          medicationName: medicationData.medicationName,
          dosage: medicationData.dosage,
          startDate: medicationData.startDate,
          stopDate: medicationData.stopDate || null,
          hour: medicationData.hour,
          notes: medicationData.notes || null,
          initials: finalInitials
        } : undefined,
        vitalsData: entryType === 'vitals' ? {
          notes: vitalsData.notes,
          initials: finalVitalsInitials,
          startDate: vitalsData.startDate,
          stopDate: vitalsData.stopDate || null,
          hour: vitalsData.hour
        } : undefined
      })
      // Reset form
      setMedicationData({
        medicationName: '',
        dosage: '',
        startDate: defaultStartDate,
        stopDate: '',
        hour: defaultHour,
        notes: '',
        initials: defaultInitials
      })
      setVitalsData({
        notes: '',
        initials: defaultInitials,
        startDate: defaultStartDate,
        stopDate: '',
        hour: defaultHour
      })
      setInitialsType('initials')
      setSelectedLegend('')
      setVitalsInitialsType('initials')
      setSelectedVitalsLegend('')
    } catch (err) {
      console.error('Error submitting entry:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Type *
        </label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="entryType"
              value="medication"
              checked={entryType === 'medication'}
              onChange={(e) => setEntryType(e.target.value as 'medication' | 'vitals')}
              className="mr-2"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Medication</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="entryType"
              value="vitals"
              checked={entryType === 'vitals'}
              onChange={(e) => setEntryType(e.target.value as 'medication' | 'vitals')}
              className="mr-2"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Vitals</span>
          </label>
        </div>
      </div>

      {/* Medication Fields */}
      {entryType === 'medication' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Medication Name *
            </label>
            <input
              type="text"
              value={medicationData.medicationName}
              onChange={(e) => setMedicationData({ ...medicationData, medicationName: e.target.value })}
              required
              placeholder="e.g., Lisinopril 10 mg"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Dosage *
            </label>
            <input
              type="text"
              value={medicationData.dosage}
              onChange={(e) => setMedicationData({ ...medicationData, dosage: e.target.value })}
              required
              placeholder="e.g., 10 mg PO daily"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                value={medicationData.startDate}
                onChange={(e) => setMedicationData({ ...medicationData, startDate: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Stop Date (optional)
              </label>
              <input
                type="date"
                value={medicationData.stopDate}
                onChange={(e) => setMedicationData({ ...medicationData, stopDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Administration Time *
            </label>
            <input
              type="text"
              value={medicationData.hour}
              onChange={(e) => setMedicationData({ ...medicationData, hour: e.target.value })}
              required
              placeholder="e.g., 09:00 or 9:00 AM"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Format: HH:MM or HH:MM AM/PM</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={medicationData.notes}
              onChange={(e) => setMedicationData({ ...medicationData, notes: e.target.value })}
              placeholder="Additional notes about this medication"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Initials or Legend *
            </label>
            
            {/* Radio buttons to choose between Initials or Legend */}
            <div className="flex gap-4 mb-3">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="initialsType"
                  value="initials"
                  checked={initialsType === 'initials'}
                  onChange={(e) => {
                    setInitialsType('initials')
                    setSelectedLegend('')
                  }}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Initials</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="initialsType"
                  value="legend"
                  checked={initialsType === 'legend'}
                  onChange={(e) => {
                    setInitialsType('legend')
                    setMedicationData({ ...medicationData, initials: '' })
                  }}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Legend</span>
              </label>
            </div>

            {/* Show initials input if "Initials" is selected */}
            {initialsType === 'initials' && (
              <div>
                <input
                  type="text"
                  value={medicationData.initials}
                  onChange={(e) => setMedicationData({ ...medicationData, initials: e.target.value.toUpperCase() })}
                  required
                  placeholder="e.g., JD or JS"
                  maxLength={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This will be used as default when you manually enter initials in individual day cells</p>
              </div>
            )}

            {/* Show legend radio buttons if "Legend" is selected */}
            {initialsType === 'legend' && (
              <div>
                <div className="grid grid-cols-2 gap-3">
                  {defaultLegends.map((legend) => (
                    <label key={legend.code} className="flex items-center p-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="selectedLegend"
                        value={legend.code}
                        checked={selectedLegend === legend.code}
                        onChange={(e) => setSelectedLegend(e.target.value)}
                        className="mr-2"
                      />
                      <div className="flex-1">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{legend.code}</span>
                        <span className="text-xs text-gray-600 dark:text-gray-400 ml-2">- {legend.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Select a legend code to use as the default marker</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Vitals Fields */}
      {entryType === 'vitals' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes *
            </label>
            <textarea
              value={vitalsData.notes}
              onChange={(e) => setVitalsData({ ...vitalsData, notes: e.target.value })}
              required
              placeholder="e.g., BP (sprinkle salt on food if BP low <80/60), Temperature, Weight, etc."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Enter vital signs instructions or notes (e.g., BP, Temperature, Weight tracking instructions)</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                value={vitalsData.startDate}
                onChange={(e) => setVitalsData({ ...vitalsData, startDate: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Stop Date (optional)
              </label>
              <input
                type="date"
                value={vitalsData.stopDate}
                onChange={(e) => setVitalsData({ ...vitalsData, stopDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Administration Time *
            </label>
            <input
              type="text"
              value={vitalsData.hour}
              onChange={(e) => setVitalsData({ ...vitalsData, hour: e.target.value })}
              required
              placeholder="e.g., 09:00 or 9:00 AM"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Format: HH:MM or HH:MM AM/PM</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Initials or Legend *
            </label>
            
            {/* Radio buttons to choose between Initials or Legend */}
            <div className="flex gap-4 mb-3">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="vitalsInitialsType"
                  value="initials"
                  checked={vitalsInitialsType === 'initials'}
                  onChange={(e) => {
                    setVitalsInitialsType('initials')
                    setSelectedVitalsLegend('')
                  }}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Initials</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="vitalsInitialsType"
                  value="legend"
                  checked={vitalsInitialsType === 'legend'}
                  onChange={(e) => {
                    setVitalsInitialsType('legend')
                    setVitalsData({ ...vitalsData, initials: '' })
                  }}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Legend</span>
              </label>
            </div>

            {/* Show initials input if "Initials" is selected */}
            {vitalsInitialsType === 'initials' && (
              <div>
                <input
                  type="text"
                  value={vitalsData.initials}
                  onChange={(e) => setVitalsData({ ...vitalsData, initials: e.target.value.toUpperCase() })}
                  required
                  placeholder="e.g., JD or JS"
                  maxLength={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This will be used as default when you manually enter initials in individual day cells</p>
              </div>
            )}

            {/* Show legend radio buttons if "Legend" is selected */}
            {vitalsInitialsType === 'legend' && (
              <div>
                <div className="grid grid-cols-2 gap-3">
                  {defaultLegends.map((legend) => (
                    <label key={legend.code} className="flex items-center p-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="selectedVitalsLegend"
                        value={legend.code}
                        checked={selectedVitalsLegend === legend.code}
                        onChange={(e) => setSelectedVitalsLegend(e.target.value)}
                        className="mr-2"
                      />
                      <div className="flex-1">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">{legend.code}</span>
                        <span className="text-xs text-gray-600 dark:text-gray-400 ml-2">- {legend.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Select a legend code to use as the default marker</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Legends Section */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">MAR Legends</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {defaultLegends.map((legend) => (
            <div key={legend.code} className="flex items-start">
              <span className="font-semibold text-gray-800 dark:text-gray-200 mr-2 min-w-[2rem]">{legend.code}:</span>
              <span className="text-gray-600 dark:text-gray-400">{legend.description}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
          These codes can be used when marking medication administration in the daily grid.
        </p>
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Adding...' : entryType === 'medication' ? 'Add Medication' : 'Add Vitals'}
        </button>
      </div>
    </form>
  )
}

// Add PRN Record Form Component
function AddPRNRecordForm({ 
  onSubmit, 
  onCancel,
  defaultDate,
  defaultHour,
  defaultInitials,
  defaultSignature
}: { 
  onSubmit: (data: {
    date: string
    hour: string
    initials: string
    medication: string
    reason: string
    result: string
    staffSignature: string
  }) => Promise<void>
  onCancel: () => void
  defaultDate: string
  defaultHour: string
  defaultInitials: string
  defaultSignature: string
}) {
  const [formData, setFormData] = useState({
    date: defaultDate,
    hour: defaultHour,
    medication: '',
    reason: '',
    result: '',
    initials: defaultInitials,
    staffSignature: defaultSignature
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.date || !formData.hour || !formData.medication || !formData.reason || !formData.initials || !formData.staffSignature) {
      alert('Please fill in all required fields')
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        date: formData.date,
        hour: formData.hour,
        medication: formData.medication,
        reason: formData.reason,
        result: formData.result || '',
        initials: formData.initials.trim().toUpperCase(),
        staffSignature: formData.staffSignature
      })
      // Reset form
      setFormData({
        date: defaultDate,
        hour: defaultHour,
        medication: '',
        reason: '',
        result: '',
        initials: defaultInitials,
        staffSignature: defaultSignature
      })
    } catch (err) {
      console.error('Error submitting PRN record:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date *
          </label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Time *
          </label>
          <input
            type="text"
            value={formData.hour}
            onChange={(e) => setFormData({ ...formData, hour: e.target.value })}
            required
            placeholder="e.g., 14:00 or 2:00 PM"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Medication Name *
        </label>
        <input
          type="text"
          value={formData.medication}
          onChange={(e) => setFormData({ ...formData, medication: e.target.value })}
          required
          placeholder="e.g., Tylenol 500 mg"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Reason *
        </label>
        <input
          type="text"
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          required
          placeholder="e.g., Headache, Pain, Refused"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Result (optional)
        </label>
        <input
          type="text"
          value={formData.result}
          onChange={(e) => setFormData({ ...formData, result: e.target.value })}
          placeholder="e.g., Pain relieved within 30 mins"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Initials *
          </label>
          <input
            type="text"
            value={formData.initials}
            onChange={(e) => setFormData({ ...formData, initials: e.target.value.toUpperCase() })}
            required
            placeholder="e.g., JD"
            maxLength={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Staff Signature *
          </label>
          <input
            type="text"
            value={formData.staffSignature}
            onChange={(e) => setFormData({ ...formData, staffSignature: e.target.value })}
            required
            placeholder="e.g., J. Smith, RN"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
        </div>
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Adding...' : 'Add PRN Record'}
        </button>
      </div>
    </form>
  )
}
