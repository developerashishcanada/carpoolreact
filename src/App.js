import React, { useState, useEffect, useRef } from 'react';
import {
  Car, User, MapPin, Clock, DollarSign, MessageCircle, Search,
  Plus, Wallet, Upload, Check, X, Send, ArrowLeft, Navigation, Users, UserCog, History, Home, Sparkles
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, collection, query, where, getDocs
} from 'firebase/firestore';

// Firebase configuration and app ID are provided by the environment
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Initialize Firebase only once
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const CarpoolApp = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentView, setCurrentView] = useState('login'); // Initial view
  const [userType, setUserType] = useState(''); // 'rider' or 'driver'
  const [rides, setRides] = useState([]);
  const [rideRequests, setRideRequests] = useState([]);
  const [wallet, setWallet] = useState({ balance: 0 }); // Default balance
  const [messages, setMessages] = useState({});
  const [activeChat, setActiveChat] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [userId, setUserId] = useState(null);

  const prevUserIdRef = useRef();

  // --- Firebase Authentication and User Data Loading ---
  useEffect(() => {
    // Sign in anonymously if no custom token, and set up auth state listener
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        // Fetch user profile if logged in
        // Corrected Firestore path: artifacts/{appId}/users/{userId}/userProfile/data
        const userProfileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'userProfile', 'data');
        const userProfileSnap = await getDoc(userProfileRef);
        if (userProfileSnap.exists()) {
          const profileData = userProfileSnap.data();
          setCurrentUser({ ...profileData, id: user.uid });
          setUserType(profileData.userType);
          setCurrentView('home'); // Go to home if already logged in
        } else {
          // If no profile, user is new or just signed in anonymously, go to registration
          setCurrentUser({ id: user.uid, userType: '' }); // Set ID for new user
          setCurrentView('register');
        }
      } else {
        // Not authenticated, try to sign in with custom token or anonymously
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
            // onAuthStateChanged will handle setting user and view
          } catch (error) {
            console.error("Error signing in with custom token:", error);
            await signInAnonymously(auth); // Fallback to anonymous
          }
        } else {
          signInAnonymously(auth); // Sign in anonymously if no token
        }
      }
      setLoading(false);
    });

    return () => unsubscribe(); // Cleanup auth listener
  }, []); // Run only once on component mount

  // --- Firestore Real-time Data Listeners ---
  useEffect(() => {
    if (!userId || loading) return; // Only attach listeners if user is ready and not loading

    // If userId changes, clear existing data and set up new listeners
    if (prevUserIdRef.current !== userId) {
      setRides([]);
      setRideRequests([]);
      setWallet({ balance: 0 });
      setMessages({});
      setActiveChat(null);
    }

    // Listen for public rides
    const ridesQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'rides'));
    const unsubscribeRides = onSnapshot(ridesQuery, (snapshot) => {
      const fetchedRides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRides(fetchedRides);
    }, (error) => console.error("Error fetching rides:", error));

    // Listen for public ride requests
    const requestsQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'rideRequests'));
    const unsubscribeRequests = onSnapshot(requestsQuery, (snapshot) => {
      const fetchedRequests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRideRequests(fetchedRequests);
    }, (error) => console.error("Error fetching ride requests:", error));

    // Listen for user's private wallet
    // Corrected Firestore path: artifacts/{appId}/users/{userId}/walletData/balance
    const walletRef = doc(db, 'artifacts', appId, 'users', userId, 'walletData', 'balance');
    const unsubscribeWallet = onSnapshot(walletRef, (docSnap) => {
      if (docSnap.exists()) {
        setWallet(docSnap.data());
      } else {
        // Initialize wallet if it doesn't exist
        setDoc(walletRef, { balance: 0 }); // Initialize with a default balance
        setWallet({ balance: 0 });
      }
    }, (error) => console.error("Error fetching wallet:", error));

    // Listen for user's messages
    const messagesQuery = query(collection(db, 'artifacts', appId, 'public', 'data', 'messages'));
    const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
      const allMessages = {};
      snapshot.docs.forEach(doc => {
        const chatData = doc.data();
        if (chatData.participants && chatData.participants.includes(userId)) {
          allMessages[doc.id] = chatData.messages || []; // Store messages array
        }
      });
      setMessages(allMessages);
    }, (error) => console.error("Error fetching messages:", error));

    prevUserIdRef.current = userId; // Update ref for next render

    return () => {
      unsubscribeRides();
      unsubscribeRequests();
      unsubscribeWallet();
      unsubscribeMessages();
    };
  }, [userId, loading]); // Re-run when userId or loading state changes

  // Helper function to check route overlap for search/matching
  const checkRouteOverlap = (route1, route2) => {
    // Ensure both routes are arrays and not empty
    if (!Array.isArray(route1) || !Array.isArray(route2) || route1.length === 0 || route2.length === 0) {
        return false;
    }
    // Convert all points to lowercase for case-insensitive comparison
    const lowerRoute1 = route1.map(point => point.toLowerCase());
    const lowerRoute2 = route2.map(point => point.toLowerCase());

    return lowerRoute1.some(point1 =>
        lowerRoute2.some(point2 =>
            point1.includes(point2) || point2.includes(point1)
        )
    );
  };

  // --- Custom Modal Component ---
  const MessageModal = ({ message, onClose }) => (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full mx-4 text-center">
        <p className="text-lg font-medium mb-4">{message}</p>
        <button
          onClick={onClose}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  );

  const showMessage = (message) => {
    setModalMessage(message);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalMessage('');
  };

  // --- Registration Component ---
  const Registration = () => {
    const [regData, setRegData] = useState({
      name: '',
      email: '',
      phone: '',
      userType: '',
      vehicle: { type: '', color: '', plate: '' },
      licenseUploaded: false,
      idUploaded: false
    });

    const handleRegistration = async () => {
      if (!regData.name || !regData.email || !regData.phone || !regData.userType) {
        showMessage('Please fill in all required fields.');
        return;
      }
      if (regData.userType === 'driver' && (!regData.vehicle.type || !regData.vehicle.color || !regData.vehicle.plate || !regData.licenseUploaded)) {
        showMessage('Please provide all vehicle details and upload your driver\'s license.');
        return;
      }
      if (regData.userType === 'rider' && !regData.idUploaded) {
        showMessage('Please upload a valid ID.');
        return;
      }

      try {
        // Corrected Firestore path for user profile
        const userProfileRef = doc(db, 'artifacts', appId, 'users', userId, 'userProfile', 'data');
        await setDoc(userProfileRef, {
          name: regData.name,
          email: regData.email,
          phone: regData.phone,
          userType: regData.userType,
          vehicle: regData.userType === 'driver' ? regData.vehicle : {},
          verificationStatus: 'pending', // Initial status
          createdAt: new Date().toISOString()
        });

        setCurrentUser({ ...regData, id: userId, verificationStatus: 'pending' });
        setUserType(regData.userType);
        setCurrentView('home');
        showMessage('Registration successful! Your profile is pending verification.');
      } catch (error) {
        console.error("Error during registration:", error);
        showMessage('Registration failed. Please try again.');
      }
    };

    return (
      <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-lg my-8">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Register for RideShare</h2>
        {userId && <p className="text-sm text-center text-gray-500 mb-4">Your User ID: <span className="font-semibold text-blue-600 break-all">{userId}</span></p>}

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Full Name"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={regData.name}
            onChange={(e) => setRegData({ ...regData, name: e.target.value })}
          />

          <input
            type="email"
            placeholder="Email"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={regData.email}
            onChange={(e) => setRegData({ ...regData, email: e.target.value })}
          />

          <input
            type="tel"
            placeholder="Phone Number"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={regData.phone}
            onChange={(e) => setRegData({ ...regData, phone: e.target.value })}
          />

          <div className="space-y-2">
            <label className="block font-medium text-gray-700">User Type:</label>
            <div className="flex space-x-4">
              <label className="flex items-center p-3 border rounded-lg flex-1 cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="userType"
                  value="driver"
                  checked={regData.userType === 'driver'}
                  onChange={(e) => setRegData({ ...regData, userType: e.target.value })}
                  className="mr-2 text-blue-600"
                />
                <Car className="w-5 h-5 mr-1 text-blue-500" />
                <span className="font-medium text-gray-800">Driver</span>
              </label>
              <label className="flex items-center p-3 border rounded-lg flex-1 cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="userType"
                  value="rider"
                  checked={regData.userType === 'rider'}
                  onChange={(e) => setRegData({ ...regData, userType: e.target.value })}
                  className="mr-2 text-green-600"
                />
                <User className="w-5 h-5 mr-1 text-green-500" />
                <span className="font-medium text-gray-800">Rider</span>
              </label>
            </div>
          </div>

          {regData.userType === 'driver' && (
            <div className="space-y-3 p-4 bg-blue-50 rounded-lg shadow-inner">
              <h3 className="font-medium text-gray-700">Vehicle Details</h3>
              <select
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={regData.vehicle.type}
                onChange={(e) => setRegData({ ...regData, vehicle: { ...regData.vehicle, type: e.target.value } })}
              >
                <option value="">Select Vehicle Type</option>
                <option value="Sedan">Sedan</option>
                <option value="SUV">SUV</option>
                <option value="Minivan">Minivan</option>
                <option value="Hatchback">Hatchback</option>
              </select>

              <input
                type="text"
                placeholder="Vehicle Color"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={regData.vehicle.color}
                onChange={(e) => setRegData({ ...regData, vehicle: { ...regData.vehicle, color: e.target.value } })}
              />

              <input
                type="text"
                placeholder="License Plate (e.g., ABCD123)"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={regData.vehicle.plate}
                onChange={(e) => setRegData({ ...regData, vehicle: { ...regData.vehicle, plate: e.target.value } })}
              />

              <div className="border-2 border-dashed border-gray-300 p-4 text-center rounded-lg">
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600">Upload Ontario Driver's License</p>
                <button
                  onClick={() => setRegData({ ...regData, licenseUploaded: !regData.licenseUploaded })} // Toggle for simulation
                  className={`mt-2 px-4 py-2 rounded-lg text-sm transition-colors ${regData.licenseUploaded ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                >
                  {regData.licenseUploaded ? 'License Uploaded ' : 'Choose File'}
                  {regData.licenseUploaded && <Check className="w-4 h-4 inline-block ml-1" />}
                </button>
              </div>
            </div>
          )}

          {regData.userType === 'rider' && (
            <div className="p-4 bg-green-50 rounded-lg shadow-inner">
              <div className="border-2 border-dashed border-gray-300 p-4 text-center rounded-lg">
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600">Upload Valid Government ID</p>
                <button
                  onClick={() => setRegData({ ...regData, idUploaded: !regData.idUploaded })} // Toggle for simulation
                  className={`mt-2 px-4 py-2 rounded-lg text-sm transition-colors ${regData.idUploaded ? 'bg-green-600 text-white' : 'bg-green-600 text-white hover:bg-green-700'}`}
                >
                  {regData.idUploaded ? 'ID Uploaded ' : 'Choose File'}
                  {regData.idUploaded && <Check className="w-4 h-4 inline-block ml-1" />}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleRegistration}
            className="w-full bg-blue-600 text-white p-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Register
          </button>
        </div>
      </div>
    );
  };

  // --- Login Component ---
  const Login = () => {
    const handleLogin = () => {
      // For this demo, we'll assume a successful login just brings them to home
      // In a real app, this would involve Firebase email/password or other methods
      if (currentUser && currentUser.userType) {
        setCurrentView('home');
        showMessage('Successfully logged in!');
      } else {
        showMessage('Please register first.');
      }
    };

    return (
      <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-lg my-8">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Welcome to RideShare</h2>
        {userId && <p className="text-sm text-center text-gray-500 mb-4">Your User ID: <span className="font-semibold text-blue-600 break-all">{userId}</span></p>}
        <div className="space-y-4">
          <input type="email" placeholder="Email (any email will work for demo)" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          <input type="password" placeholder="Password (any password will work for demo)" className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 text-white p-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Login
          </button>
          <button
            onClick={() => setCurrentView('register')}
            className="w-full border border-blue-600 text-blue-600 p-3 rounded-lg font-medium hover:bg-blue-50 transition-colors"
          >
            New User? Register
          </button>
        </div>
      </div>
    );
  };

  // --- Messaging Component ---
  const MessagingView = () => {
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef(null);

    // Scroll to bottom of messages
    useEffect(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }, [activeChat, messages]);

    // Generate chat list dynamically from rides and rideRequests
    const chatList = [];
    if (currentUser) {
      // Chats related to rides posted by the current driver
      if (currentUser.userType === 'driver') {
        rides.filter(ride => ride.driverId === currentUser.id).forEach(ride => {
          rideRequests.filter(req => req.rideId === ride.id && req.status === 'accepted').forEach(request => {
            const chatId = `ride-${ride.id}-rider-${request.riderId}`;
            // Find existing messages for this chat
            const chatMessages = messages[chatId] || [];
            chatList.push({
              id: chatId,
              name: request.riderName,
              rideInfo: `Ride: ${ride.from} to ${ride.to}`,
              lastMessage: chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].text : 'No messages yet',
              unread: 0, // Implement unread count if needed
              partnerId: request.riderId
            });
          });
        });
      }

      // Chats related to ride requests made by the current rider
      if (currentUser.userType === 'rider') {
        rideRequests.filter(req => req.riderId === currentUser.id && req.status === 'accepted').forEach(request => {
          const ride = rides.find(r => r.id === request.rideId);
          if (ride) {
            const chatId = `ride-${ride.id}-rider-${request.riderId}`;
            const chatMessages = messages[chatId] || [];
            chatList.push({
              id: chatId,
              name: ride.driverName,
              rideInfo: `Ride: ${ride.from} to ${ride.to}`,
              lastMessage: chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].text : 'No messages yet',
              unread: 0, // Implement unread count if needed
              partnerId: ride.driverId
            });
          }
        });
      }

      // Chats initiated via "Contact Rider" from FindRiders
      rideRequests.filter(req => req.status === 'searching' && req.contactInitiatedBy === currentUser.id).forEach(request => {
        const chatId = `initial-contact-driver-${currentUser.id}-rider-${request.riderId}`;
        const chatMessages = messages[chatId] || [];
        chatList.push({
          id: chatId,
          name: request.riderName,
          rideInfo: `Request: ${request.from} to ${request.to}`,
          lastMessage: chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].text : 'No messages yet',
          unread: 0,
          partnerId: request.riderId
        });
      });
    }


    const sendMessage = async () => {
      if (!newMessage.trim() || !activeChat) {
        showMessage("Message cannot be empty.");
        return;
      }

      const chatId = activeChat.id;
      const message = {
        senderId: currentUser.id,
        senderName: currentUser.name,
        text: newMessage,
        timestamp: new Date().toISOString()
      };

      try {
        const chatDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'messages', chatId);
        const chatDocSnap = await getDoc(chatDocRef);

        let updatedMessages = [];
        if (chatDocSnap.exists()) {
          const currentChatData = chatDocSnap.data();
          updatedMessages = [...(currentChatData.messages || []), message];
          await updateDoc(chatDocRef, { messages: updatedMessages });
        } else {
          // If chat doesn't exist, create it with initial participants
          await setDoc(chatDocRef, {
            participants: [currentUser.id, activeChat.partnerId],
            messages: [message],
            createdAt: new Date().toISOString()
          });
        }

        setMessages(prev => ({
          ...prev,
          [chatId]: updatedMessages
        }));
        setNewMessage('');
      } catch (error) {
        console.error("Error sending message:", error);
        showMessage("Failed to send message. Please try again.");
      }
    };

    if (activeChat) {
      const chatMessages = messages[activeChat.id] || [];
      return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-50 rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center p-4 border-b border-gray-200 bg-blue-600 text-white shadow-md">
            <button
              onClick={() => setActiveChat(null)}
              className="mr-3 p-2 rounded-full hover:bg-blue-700 transition-colors"
              aria-label="Back to chat list"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="font-semibold text-lg">{activeChat.name}</h3>
              <p className="text-sm text-blue-100">{activeChat.rideInfo}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {chatMessages.length > 0 ? (
              chatMessages.map(message => (
                <div
                  key={message.timestamp + message.senderId} // Using timestamp + senderId for unique key
                  className={`flex ${message.senderId === currentUser.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] p-3 rounded-lg shadow-sm ${
                      message.senderId === currentUser.id
                        ? 'bg-blue-600 text-white rounded-br-none'
                        : 'bg-gray-200 text-gray-800 rounded-bl-none'
                    }`}
                  >
                    <p className="text-sm break-words">{message.text}</p>
                    <p className="text-xs mt-1 text-right opacity-80">
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-500 mt-8">
                <MessageCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No messages yet. Start the conversation!</p>
              </div>
            )}
            <div ref={messagesEndRef} /> {/* For auto-scrolling */}
          </div>

          <div className="p-4 border-t border-gray-200 bg-white shadow-md">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              />
              <button
                onClick={sendMessage}
                className="bg-blue-600 text-white p-3 rounded-lg shadow hover:bg-blue-700 transition-colors"
                aria-label="Send message"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 bg-white rounded-xl shadow-lg min-h-[calc(100vh-64px-32px)]">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Messages</h2>
        {chatList.length > 0 ? (
          <div className="space-y-3">
            {chatList.map(chat => (
              <div
                key={chat.id}
                onClick={() => setActiveChat(chat)}
                className="p-4 border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors flex items-center justify-between"
              >
                <div>
                  <h3 className="font-medium text-gray-900">{chat.name}</h3>
                  <p className="text-sm text-gray-600">{chat.rideInfo}</p>
                  <p className="text-sm text-gray-500 mt-1 truncate max-w-[80%]">{chat.lastMessage}</p>
                </div>
                {chat.unread > 0 && (
                  <span className="bg-blue-600 text-white text-xs px-2.5 py-1 rounded-full font-bold">
                    {chat.unread}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 mt-8">
            <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">No active conversations</p>
            <p className="text-sm">Start by booking a ride or finding riders for your posted rides!</p>
          </div>
        )}
      </div>
    );
  };

  // --- Post Ride Component (Driver) ---
  const PostRide = () => {
    const [rideData, setRideData] = useState({
      from: '',
      to: '',
      startTime: '',
      availableSeats: 1,
      pricePerSeat: 10,
      route: ['']
    });
    const [isSuggestingPrice, setIsSuggestingPrice] = useState(false);

    const addRoutePoint = () => {
      setRideData({ ...rideData, route: [...rideData.route, ''] });
    };

    const updateRoutePoint = (index, value) => {
      const newRoute = [...rideData.route];
      newRoute[index] = value;
      setRideData({ ...rideData, route: newRoute });
    };

    const removeRoutePoint = (index) => {
      const newRoute = rideData.route.filter((_, i) => i !== index);
      setRideData({ ...rideData, route: newRoute });
    };

    const handlePostRide = async () => {
      if (!rideData.from || !rideData.to || !rideData.startTime || !rideData.availableSeats || !rideData.pricePerSeat) {
        showMessage('Please fill in all required ride details.');
        return;
      }
      if (currentUser.userType !== 'driver') {
        showMessage('Only drivers can post rides.');
        return;
      }

      const filteredRoute = rideData.route.filter(point => point.trim() !== '');
      const newRide = {
        driverId: currentUser.id,
        driverName: currentUser.name,
        from: rideData.from,
        to: rideData.to,
        startTime: rideData.startTime,
        availableSeats: rideData.availableSeats,
        pricePerSeat: rideData.pricePerSeat,
        route: [rideData.from, ...filteredRoute, rideData.to],
        car: currentUser.vehicle || { type: 'Unknown', color: 'Unknown', plate: 'N/A' },
        createdAt: new Date().toISOString(),
        status: 'active'
      };

      try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'rides'), newRide);
        showMessage('Ride posted successfully!');
        setCurrentView('myRides');
      } catch (error) {
        console.error("Error posting ride:", error);
        showMessage('Failed to post ride. Please try again.');
      }
    };

    // LLM Feature: Suggest Price
    const suggestPrice = async () => {
        if (!rideData.from || !rideData.to) {
            showMessage("Please enter 'From' and 'To' locations to get a price suggestion.");
            return;
        }

        setIsSuggestingPrice(true);
        try {
            const prompt = `Suggest a fair price per seat for a carpool ride from "${rideData.from}" to "${rideData.to}" starting at "${rideData.startTime}". Consider typical carpool costs for this distance and time. Provide only the numeric price, without currency symbols or extra text.`;
            let chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: prompt }] });
            const payload = { contents: chatHistory };
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                const suggested = parseInt(text.match(/\d+/)?.[0]); // Extract first number
                if (!isNaN(suggested) && suggested > 0) {
                    setRideData(prev => ({ ...prev, pricePerSeat: suggested }));
                    showMessage(`Suggested price: $${suggested}. You can adjust it.`);
                } else {
                    showMessage("Could not get a valid price suggestion. Try again.");
                }
            } else {
                showMessage("Failed to get price suggestion. No valid response from LLM.");
            }
        } catch (error) {
            console.error("Error suggesting price:", error);
            showMessage("Error getting price suggestion. Please try again later.");
        } finally {
            setIsSuggestingPrice(false);
        }
    };


    return (
      <div className="p-6 bg-white rounded-xl shadow-lg my-8 max-w-xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">Post a New Ride</h2>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="From (e.g., Toronto Downtown)"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={rideData.from}
            onChange={(e) => setRideData({ ...rideData, from: e.target.value })}
          />
          <input
            type="text"
            placeholder="To (e.g., Mississauga)"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={rideData.to}
            onChange={(e) => setRideData({ ...rideData, to: e.target.value })}
          />

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-700">Route Stops (Optional)</h3>
              <button
                onClick={addRoutePoint}
                className="text-blue-600 text-sm flex items-center hover:text-blue-800 transition-colors"
                aria-label="Add stop"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Stop
              </button>
            </div>
            {rideData.route.map((point, index) => (
              <div key={index} className="flex items-center space-x-2 mb-2">
                <input
                  type="text"
                  placeholder={`Stop ${index + 1}`}
                  className="flex-1 p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  value={point}
                  onChange={(e) => updateRoutePoint(index, e.target.value)}
                />
                {rideData.route.length > 1 && (
                  <button
                    onClick={() => removeRoutePoint(index)}
                    className="text-red-500 hover:text-red-700 transition-colors"
                    aria-label={`Remove stop ${index + 1}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <input
            type="datetime-local"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={rideData.startTime}
            onChange={(e) => setRideData({ ...rideData, startTime: e.target.value })}
          />
          <input
            type="number"
            placeholder="Available Seats"
            min="1"
            max="7"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={rideData.availableSeats}
            onChange={(e) => setRideData({ ...rideData, availableSeats: parseInt(e.target.value) })}
          />
          <div className="flex items-center space-x-2">
            <input
                type="number"
                placeholder="Price per Seat ($)"
                min="5"
                className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={rideData.pricePerSeat}
                onChange={(e) => setRideData({ ...rideData, pricePerSeat: parseInt(e.target.value) })}
            />
            <button
                onClick={suggestPrice}
                disabled={isSuggestingPrice}
                className="bg-blue-500 text-white p-3 rounded-lg font-medium hover:bg-blue-600 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSuggestingPrice ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                ) : (
                    <>Suggest Price ✨</>
                )}
            </button>
          </div>
          <button
            onClick={handlePostRide}
            className="w-full bg-green-600 text-white p-3 rounded-lg font-medium hover:bg-green-700 transition-colors shadow-md"
          >
            Post Ride
          </button>
        </div>
      </div>
    );
  };

  // --- Search Rides Component (Rider) ---
  const SearchRides = () => {
    const [searchQuery, setSearchQuery] = useState({ from: '', to: '', route: [''] });
    const [filteredRides, setFilteredRides] = useState([]);

    useEffect(() => {
      // Initial filter on component mount or rides update
      handleSearch();
    }, [rides]); // Rerun search when 'rides' data changes

    const addSearchRoutePoint = () => {
      setSearchQuery({ ...searchQuery, route: [...searchQuery.route, ''] });
    };

    const updateSearchRoutePoint = (index, value) => {
      const newRoute = [...searchQuery.route];
      newRoute[index] = value;
      setSearchQuery({ ...searchQuery, route: newRoute });
    };

    const handleSearch = () => {
      const searchRoutePoints = searchQuery.route.filter(p => p.trim());
      const fullSearchRoute = [searchQuery.from, ...searchRoutePoints, searchQuery.to].filter(p => p.trim());

      const filtered = rides.filter(ride => {
        const fromMatch = searchQuery.from ? ride.from.toLowerCase().includes(searchQuery.from.toLowerCase()) : true;
        const toMatch = searchQuery.to ? ride.to.toLowerCase().includes(searchQuery.to.toLowerCase()) : true;
        const seatsAvailable = ride.availableSeats > 0;
        const routeMatch = fullSearchRoute.length > 0 ? checkRouteOverlap(ride.route, fullSearchRoute) : true;

        return fromMatch && toMatch && seatsAvailable && routeMatch;
      });
      setFilteredRides(filtered);
    };

    const requestRide = async (rideId) => {
      if (currentUser.userType !== 'rider') {
        showMessage('Only riders can request rides.');
        return;
      }

      const ride = rides.find(r => r.id === rideId);
      if (!ride) {
        showMessage('Ride not found.');
        return;
      }
      if (ride.availableSeats <= 0) {
        showMessage('No seats available for this ride.');
        return;
      }

      // Check if rider already has a pending/accepted request for this ride
      const existingRequest = rideRequests.find(
        req => req.rideId === rideId && req.riderId === currentUser.id && (req.status === 'pending' || req.status === 'accepted')
      );

      if (existingRequest) {
        showMessage('You already have a pending or accepted request for this ride.');
        return;
      }

      const newRequest = {
        rideId,
        riderId: currentUser.id,
        riderName: currentUser.name,
        driverId: ride.driverId,
        driverName: ride.driverName,
        from: ride.from,
        to: ride.to,
        rideStartTime: ride.startTime,
        price: ride.pricePerSeat,
        status: 'pending', // pending, accepted, rejected, completed, cancelled
        requestedAt: new Date().toISOString()
      };

      try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'rideRequests'), newRequest);
        showMessage('Ride request sent successfully! Driver will be notified.');
      } catch (error) {
        console.error("Error sending ride request:", error);
        showMessage('Failed to send ride request. Please try again.');
      }
    };

    const startChat = async (ride) => {
      const chatId = `ride-${ride.id}-rider-${currentUser.id}`;
      // Ensure the chat document exists for this conversation
      const chatDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'messages', chatId);
      const chatDocSnap = await getDoc(chatDocRef);

      if (!chatDocSnap.exists()) {
        await setDoc(chatDocRef, {
          participants: [currentUser.id, ride.driverId],
          messages: [],
          createdAt: new Date().toISOString()
        });
      }

      setActiveChat({
        id: chatId,
        name: ride.driverName,
        rideInfo: `${ride.from} to ${ride.to}`,
        partnerId: ride.driverId
      });
      setCurrentView('messages');
    };


    return (
      <div className="p-6 bg-white rounded-xl shadow-lg my-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">Search Rides</h2>
        <div className="space-y-4 mb-6 p-4 bg-gray-50 rounded-lg shadow-inner">
          <input
            type="text"
            placeholder="From (e.g., Downtown)"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={searchQuery.from}
            onChange={(e) => setSearchQuery({ ...searchQuery, from: e.target.value })}
          />
          <input
            type="text"
            placeholder="To (e.g., Airport)"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={searchQuery.to}
            onChange={(e) => setSearchQuery({ ...searchQuery, to: e.target.value })}
          />

          <div className="border border-gray-200 rounded-lg p-4 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-700">Route Stops (Optional)</h3>
              <button
                onClick={addSearchRoutePoint}
                className="text-blue-600 text-sm flex items-center hover:text-blue-800 transition-colors"
                aria-label="Add search route point"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Point
              </button>
            </div>
            {searchQuery.route.map((point, index) => (
              <input
                key={index}
                type="text"
                placeholder={`Search stop ${index + 1}`}
                className="w-full p-2 border border-gray-300 rounded mb-2 focus:ring-2 focus:ring-blue-500"
                value={point}
                onChange={(e) => updateSearchRoutePoint(index, e.target.value)}
              />
            ))}
          </div>

          <button
            onClick={handleSearch}
            className="w-full bg-blue-600 text-white p-3 rounded-lg font-medium flex items-center justify-center hover:bg-blue-700 transition-colors shadow-md"
          >
            <Search className="w-5 h-5 mr-2" />
            Search Rides
          </button>
        </div>

        <div className="space-y-4">
          {filteredRides.length > 0 ? (
            filteredRides.map(ride => (
              <div key={ride.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">{ride.driverName}</h3>
                    <p className="text-sm text-gray-600">{ride.car.color} {ride.car.type} ({ride.car.plate})</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-green-600 text-xl">${ride.pricePerSeat}</p>
                    <p className="text-sm text-gray-600">{ride.availableSeats} seats left</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 mb-2">
                  <MapPin className="w-4 h-4 text-blue-500" />
                  <span className="text-base text-gray-800">{ride.from} <span className="text-gray-400">→</span> {ride.to}</span>
                </div>
                {ride.route && ride.route.length > 2 && (
                  <div className="flex items-center space-x-2 mb-2 text-sm text-gray-600">
                    <Navigation className="w-4 h-4 text-gray-500" />
                    <span className="truncate">Via: {ride.route.slice(1, -1).join(', ')}</span>
                  </div>
                )}
                <div className="flex items-center space-x-2 mb-3">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-700">{new Date(ride.startTime).toLocaleString()}</span>
                </div>
                <div className="flex space-x-2 mt-4">
                  <button
                    onClick={() => requestRide(ride.id)}
                    className="flex-1 bg-blue-600 text-white p-3 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-md"
                  >
                    Request Ride
                  </button>
                  <button
                    onClick={() => startChat(ride)}
                    className="p-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors shadow-sm"
                    aria-label="Chat with driver"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500 mt-8">
              <Search className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">No rides found matching your criteria</p>
              <p className="text-sm">Try adjusting your search filters or check back later!</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- My Rides Component (Driver) ---
  const MyRides = () => {
    const driverRides = rides.filter(ride => ride.driverId === currentUser.id);

    const acceptRequest = async (requestId, rideId) => {
      try {
        const requestRef = doc(db, 'artifacts', appId, 'public', 'data', 'rideRequests', requestId);
        await updateDoc(requestRef, { status: 'accepted' });

        // Decrease available seats for the ride
        const rideRef = doc(db, 'artifacts', appId, 'public', 'data', 'rides', rideId);
        const rideSnap = await getDoc(rideRef);
        if (rideSnap.exists()) {
          const currentSeats = rideSnap.data().availableSeats;
          await updateDoc(rideRef, { availableSeats: currentSeats - 1 });
        }
        showMessage('Ride request accepted!');
      } catch (error) {
        console.error("Error accepting request:", error);
        showMessage('Failed to accept request.');
      }
    };

    const rejectRequest = async (requestId) => {
      try {
        const requestRef = doc(db, 'artifacts', appId, 'public', 'data', 'rideRequests', requestId);
        await updateDoc(requestRef, { status: 'rejected' });
        showMessage('Ride request rejected.');
      } catch (error) {
        console.error("Error rejecting request:", error);
        showMessage('Failed to reject request.');
      }
    };

    const completeRide = async (rideId, riderId, price) => {
      try {
        // Update ride status to completed
        const rideRef = doc(db, 'artifacts', appId, 'public', 'data', 'rides', rideId);
        await updateDoc(rideRef, { status: 'completed' });

        // Update rider's request status to completed
        const riderRequestQuery = query(
          collection(db, 'artifacts', appId, 'public', 'data', 'rideRequests'),
          where('rideId', '==', rideId),
          where('riderId', '==', riderId),
          where('status', '==', 'accepted') // Only complete accepted requests
        );
        const riderRequestSnap = await getDocs(riderRequestQuery);
        if (!riderRequestSnap.empty) {
          riderRequestSnap.docs.forEach(async (docSnap) => {
            await updateDoc(docSnap.ref, { status: 'completed' });
          });
        }

        // Add funds to driver's wallet
        // Corrected Firestore path for wallet
        const driverWalletRef = doc(db, 'artifacts', appId, 'users', currentUser.id, 'walletData', 'balance');
        await updateDoc(driverWalletRef, { balance: wallet.balance + price });

        // Deduct funds from rider's wallet (in a real app, this would be more complex and involve a server)
        // Corrected Firestore path for wallet
        const riderWalletRef = doc(db, 'artifacts', appId, 'users', riderId, 'walletData', 'balance');
        const riderWalletSnap = await getDoc(riderWalletRef);
        if (riderWalletSnap.exists()) {
          const riderCurrentBalance = riderWalletSnap.data().balance;
          await updateDoc(riderWalletRef, { balance: riderCurrentBalance - price });
        }

        showMessage('Ride marked as completed and payment processed!');
      } catch (error) {
        console.error("Error completing ride:", error);
        showMessage('Failed to complete ride.');
      }
    };

    return (
      <div className="p-6 bg-white rounded-xl shadow-lg my-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">My Posted Rides</h2>
        {driverRides.length > 0 ? (
          <div className="space-y-6">
            {driverRides.map(ride => (
              <div key={ride.id} className="border border-gray-200 rounded-xl p-6 bg-gray-50 shadow-md">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="font-bold text-xl text-blue-600">{ride.from} <span className="text-gray-400">→</span> {ride.to}</h3>
                    <p className="text-md text-gray-700">{new Date(ride.startTime).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg text-green-600">${ride.pricePerSeat} / seat</p>
                    <p className="text-sm text-gray-600">{ride.availableSeats} seats left</p>
                  </div>
                </div>
                {ride.route && ride.route.length > 2 && (
                    <p className="text-sm text-gray-600 mb-3"><span className="font-semibold">Route:</span> {ride.route.join(' → ')}</p>
                )}
                <p className="text-sm text-gray-600 mb-4">Status: <span className={`font-semibold ${ride.status === 'active' ? 'text-green-500' : 'text-gray-500'}`}>{ride.status}</span></p>

                <h4 className="font-semibold text-lg text-gray-800 mb-3">Ride Requests:</h4>
                {rideRequests.filter(req => req.rideId === ride.id).length > 0 ? (
                  <div className="space-y-3">
                    {rideRequests.filter(req => req.rideId === ride.id).map(request => (
                      <div key={request.id} className="border border-gray-200 rounded-lg p-3 bg-white flex justify-between items-center shadow-sm">
                        <div>
                          <p className="font-medium">{request.riderName}</p>
                          <p className="text-sm text-gray-600">{request.from} → {request.to}</p>
                          <p className="text-xs text-gray-500">Status: <span className={`font-semibold ${request.status === 'pending' ? 'text-yellow-600' : request.status === 'accepted' ? 'text-green-600' : 'text-red-600'}`}>{request.status}</span></p>
                        </div>
                        <div className="flex space-x-2">
                          {request.status === 'pending' && (
                            <>
                              <button
                                onClick={() => acceptRequest(request.id, ride.id)}
                                className="bg-green-500 text-white p-2 rounded-lg text-sm hover:bg-green-600 transition-colors"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => rejectRequest(request.id)}
                                className="bg-red-500 text-white p-2 rounded-lg text-sm hover:bg-red-600 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {request.status === 'accepted' && (
                            <button
                              onClick={() => completeRide(ride.id, request.riderId, ride.pricePerSeat)}
                              className="bg-purple-600 text-white p-2 rounded-lg text-sm hover:bg-purple-700 transition-colors"
                            >
                              <DollarSign className="w-4 h-4 mr-1 inline-block" /> Complete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No requests for this ride yet.</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 mt-8">
            <Car className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">You haven't posted any rides yet.</p>
            <p className="text-sm">Click "Post Ride" to get started!</p>
          </div>
        )}
      </div>
    );
  };

  // --- My Requests Component (Rider) ---
  const MyRequests = () => {
    const riderRequests = rideRequests.filter(req => req.riderId === currentUser.id);

    const cancelRequest = async (requestId) => {
      try {
        const requestRef = doc(db, 'artifacts', appId, 'public', 'data', 'rideRequests', requestId);
        await updateDoc(requestRef, { status: 'cancelled' });
        showMessage('Ride request cancelled.');
      } catch (error) {
        console.error("Error cancelling request:", error);
        showMessage('Failed to cancel request.');
      }
    };

    return (
      <div className="p-6 bg-white rounded-xl shadow-lg my-8">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">My Ride Requests</h2>
        {riderRequests.length > 0 ? (
          <div className="space-y-4">
            {riderRequests.map(request => {
              const ride = rides.find(r => r.id === request.rideId);
              return (
                <div key={request.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <h3 className="font-bold text-lg text-gray-900">{request.from} <span className="text-gray-400">→</span> {request.to}</h3>
                      <p className="text-sm text-gray-600">Requested: {new Date(request.requestedAt).toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600 text-lg">${request.price}</p>
                      {ride && <p className="text-sm text-gray-600">Driver: {ride.driverName}</p>}
                    </div>
                  </div>
                  <p className="text-sm mb-3">Status: <span className={`font-semibold ${request.status === 'pending' ? 'text-yellow-600' : request.status === 'accepted' ? 'text-green-600' : request.status === 'rejected' ? 'text-red-600' : 'text-gray-600'}`}>{request.status}</span></p>

                  {request.status === 'pending' && (
                    <button
                      onClick={() => cancelRequest(request.id)}
                      className="w-full bg-red-500 text-white p-2 rounded-lg font-medium hover:bg-red-600 transition-colors"
                    >
                      Cancel Request
                    </button>
                  )}
                  {request.status === 'accepted' && (
                     <p className="text-green-600 font-semibold text-center mt-3">Your ride is confirmed!</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-gray-500 mt-8">
            <History className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">You haven't made any ride requests yet.</p>
            <p className="text-sm">Click "Search Rides" to find your next carpool!</p>
          </div>
        )}
      </div>
    );
  };

  // --- Post Ride Request Component (Rider) ---
  const PostRideRequest = () => {
    const [requestData, setRequestData] = useState({
      from: '',
      to: '',
      preferredTime: '',
      maxPrice: 20,
      route: ['']
    });
    const [isRefiningRequest, setIsRefiningRequest] = useState(false);
    const [refinementSuggestion, setRefinementSuggestion] = useState('');

    const addRoutePoint = () => {
      setRequestData({ ...requestData, route: [...requestData.route, ''] });
    };

    const updateRoutePoint = (index, value) => {
      const newRoute = [...requestData.route];
      newRoute[index] = value;
      setRequestData({ ...requestData, route: newRoute });
    };

    const handlePostRequest = async () => {
      if (!requestData.from || !requestData.to || !requestData.preferredTime || !requestData.maxPrice) {
        showMessage('Please fill in all required request details.');
        return;
      }
      if (currentUser.userType !== 'rider') {
        showMessage('Only riders can post ride requests.');
        return;
      }

      const filteredRoute = requestData.route.filter(point => point.trim() !== '');
      const newRequest = {
        riderId: currentUser.id,
        riderName: currentUser.name,
        from: requestData.from,
        to: requestData.to,
        preferredTime: requestData.preferredTime,
        maxPrice: requestData.maxPrice,
        route: [requestData.from, ...filteredRoute, requestData.to],
        status: 'searching', // searching, pending, accepted, rejected, completed, cancelled
        createdAt: new Date().toISOString()
      };
      try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'rideRequests'), newRequest);
        showMessage('Ride request posted! Drivers will be notified.');
        setCurrentView('myRequests');
      } catch (error) {
        console.error("Error posting ride request:", error);
        showMessage('Failed to post ride request. Please try again.');
      }
    };

    // LLM Feature: Refine Request
    const refineRequest = async () => {
        if (!requestData.from || !requestData.to || !requestData.preferredTime || !requestData.maxPrice) {
            showMessage("Please fill in 'From', 'To', 'Preferred Time', and 'Max Price' to get refinement suggestions.");
            return;
        }

        setIsRefiningRequest(true);
        setRefinementSuggestion('');
        try {
            const prompt = `I am a rider looking for a carpool. My request details are: From "${requestData.from}", To "${requestData.to}", Preferred Time "${new Date(requestData.preferredTime).toLocaleString()}", Max Price "${requestData.maxPrice}". Suggest ways to refine my ride request to increase the chances of finding a match. Include alternative nearby pickup/dropoff points or slightly flexible times. Keep the suggestion concise and actionable.`;
            let chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: prompt }] });
            const payload = { contents: chatHistory };
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                setRefinementSuggestion(text);
                showMessage("Refinement suggestion generated below.");
            } else {
                showMessage("Failed to get refinement suggestion. No valid response from LLM.");
            }
        } catch (error) {
            console.error("Error refining request:", error);
            showMessage("Error getting refinement suggestion. Please try again later.");
        } finally {
            setIsRefiningRequest(false);
        }
    };


    return (
      <div className="p-6 bg-white rounded-xl shadow-lg my-8 max-w-xl mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">Post Ride Request</h2>
        <div className="space-y-4">
          <input
            type="text"
            placeholder="From"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={requestData.from}
            onChange={(e) => setRequestData({ ...requestData, from: e.target.value })}
          />
          <input
            type="text"
            placeholder="To"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={requestData.to}
            onChange={(e) => setRequestData({ ...requestData, to: e.target.value })}
          />

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-700">Flexible Route Points (Optional)</h3>
              <button
                onClick={addRoutePoint}
                className="text-blue-600 text-sm flex items-center hover:text-blue-800 transition-colors"
                aria-label="Add route point"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Point
              </button>
            </div>
            {requestData.route.map((point, index) => (
              <input
                key={index}
                type="text"
                placeholder={`Flexible stop ${index + 1}`}
                className="w-full p-2 border border-gray-300 rounded mb-2 focus:ring-2 focus:ring-blue-500"
                value={point}
                onChange={(e) => updateRoutePoint(index, e.target.value)}
              />
            ))}
          </div>

          <input
            type="datetime-local"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={requestData.preferredTime}
            onChange={(e) => setRequestData({ ...requestData, preferredTime: e.target.value })}
          />
          <input
            type="number"
            placeholder="Max Price ($)"
            min="5"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={requestData.maxPrice}
            onChange={(e) => setRequestData({ ...requestData, maxPrice: parseInt(e.target.value) })}
          />

          <button
            onClick={handlePostRequest}
            className="w-full bg-green-600 text-white p-3 rounded-lg font-medium hover:bg-green-700 transition-colors shadow-md"
          >
            Post Request
          </button>
          
          <button
              onClick={refineRequest}
              disabled={isRefiningRequest}
              className="w-full bg-purple-600 text-white p-3 rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-md mt-4"
          >
              {isRefiningRequest ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
              ) : (
                  <>Refine Request ✨</>
              )}
          </button>
          {refinementSuggestion && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                  <h4 className="font-semibold mb-2">Refinement Suggestion:</h4>
                  <p>{refinementSuggestion}</p>
              </div>
          )}
        </div>
      </div>
    );
  };

  // --- Wallet Component ---
  const WalletView = () => {
    const [amount, setAmount] = useState('');

    const handleAddFunds = async () => {
      const depositAmount = parseFloat(amount);
      if (isNaN(depositAmount) || depositAmount <= 0) {
        showMessage('Please enter a valid amount.');
        return;
      }
      try {
        // Corrected Firestore path for wallet
        const walletRef = doc(db, 'artifacts', appId, 'users', userId, 'walletData', 'balance');
        await updateDoc(walletRef, { balance: wallet.balance + depositAmount });
        showMessage(`Successfully added $${depositAmount.toFixed(2)} to your wallet.`);
        setAmount('');
      } catch (error) {
        console.error("Error adding funds:", error);
        showMessage('Failed to add funds.');
      }
    };

    const handleWithdrawFunds = async () => {
      const withdrawAmount = parseFloat(amount);
      if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
        showMessage('Please enter a valid amount.');
        return;
      }
      if (withdrawAmount > wallet.balance) {
        showMessage('Insufficient balance.');
        return;
      }
      try {
        // Corrected Firestore path for wallet
        const walletRef = doc(db, 'artifacts', appId, 'users', userId, 'walletData', 'balance');
        await updateDoc(walletRef, { balance: wallet.balance - withdrawAmount });
        showMessage(`Successfully withdrew $${withdrawAmount.toFixed(2)} from your wallet.`);
        setAmount('');
      } catch (error) {
        console.error("Error withdrawing funds:", error);
        showMessage('Failed to withdraw funds.');
      }
    };

    return (
      <div className="p-6 bg-white rounded-xl shadow-lg my-8 max-w-md mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">My Wallet</h2>
        <div className="text-center mb-6">
          <p className="text-lg text-gray-600">Current Balance:</p>
          <p className="text-5xl font-extrabold text-green-600">${wallet.balance.toFixed(2)}</p>
        </div>

        <div className="space-y-4">
          <input
            type="number"
            placeholder="Enter Amount"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0.01"
            step="0.01"
          />
          <button
            onClick={handleAddFunds}
            className="w-full bg-blue-600 text-white p-3 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-md"
          >
            <Plus className="w-5 h-5 inline-block mr-2" /> Add Funds
          </button>
          <button
            onClick={handleWithdrawFunds}
            className="w-full bg-red-600 text-white p-3 rounded-lg font-medium hover:bg-red-700 transition-colors shadow-md"
          >
            <Wallet className="w-5 h-5 inline-block mr-2" /> Withdraw Funds
          </button>
        </div>
      </div>
    );
  };

  // --- Profile Component ---
  const ProfileView = () => {
    if (!currentUser) return <p className="text-center text-gray-600 mt-8">Loading profile...</p>;

    return (
      <div className="p-6 bg-white rounded-xl shadow-lg my-8 max-w-md mx-auto">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">My Profile</h2>
        <div className="space-y-4 text-gray-700">
          <div className="flex items-center space-x-3">
            <User className="w-6 h-6 text-blue-500" />
            <p><span className="font-semibold">Name:</span> {currentUser.name}</p>
          </div>
          <div className="flex items-center space-x-3">
            <UserCog className="w-6 h-6 text-blue-500" />
            <p><span className="font-semibold">User Type:</span> {currentUser.userType}</p>
          </div>
          <div className="flex items-center space-x-3">
            <Clock className="w-6 h-6 text-blue-500" />
            <p><span className="font-semibold">User ID:</span> <span className="break-all">{currentUser.id}</span></p>
          </div>
          <div className="flex items-center space-x-3">
            <MessageCircle className="w-6 h-6 text-blue-500" />
            <p><span className="font-semibold">Email:</span> {currentUser.email}</p>
          </div>
          <div className="flex items-center space-x-3">
            <Wallet className="w-6 h-6 text-blue-500" />
            <p><span className="font-semibold">Phone:</span> {currentUser.phone}</p>
          </div>
          <div className="flex items-center space-x-3">
            <Check className="w-6 h-6 text-blue-500" />
            <p><span className="font-semibold">Verification Status:</span> <span className="font-semibold text-green-600">{currentUser.verificationStatus || 'N/A'}</span></p>
          </div>

          {currentUser.userType === 'driver' && currentUser.vehicle && (
            <div className="space-y-2 border-t pt-4 mt-4 border-gray-200">
              <h3 className="font-semibold text-lg text-gray-800">Vehicle Details:</h3>
              <div className="flex items-center space-x-3">
                <Car className="w-6 h-6 text-blue-500" />
                <p><span className="font-semibold">Type:</span> {currentUser.vehicle.type}</p>
              </div>
              <div className="flex items-center space-x-3">
                <Car className="w-6 h-6 text-blue-500" />
                <p><span className="font-semibold">Color:</span> {currentUser.vehicle.color}</p>
              </div>
              <div className="flex items-center space-x-3">
                <Car className="w-6 h-6 text-blue-500" />
                <p><span className="font-semibold">Plate:</span> {currentUser.vehicle.plate}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };


  // --- Home Component (Dashboard) ---
  const HomeView = () => (
    <div className="p-6 bg-white rounded-xl shadow-lg my-8">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">Welcome, {currentUser?.name || 'User'}!</h2>
      {userId && <p className="text-sm text-center text-gray-500 mb-4">Your User ID: <span className="font-semibold text-blue-600 break-all">{userId}</span></p>}


      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {userType === 'rider' && (
          <div
            onClick={() => setCurrentView('searchRides')}
            className="flex flex-col items-center justify-center p-6 bg-blue-100 text-blue-800 rounded-xl shadow-md cursor-pointer hover:bg-blue-200 transition-colors"
          >
            <Search className="w-12 h-12 mb-3" />
            <p className="font-semibold text-lg">Search Rides</p>
          </div>
        )}
        {userType === 'rider' && (
          <div
            onClick={() => setCurrentView('myRequests')}
            className="flex flex-col items-center justify-center p-6 bg-purple-100 text-purple-800 rounded-xl shadow-md cursor-pointer hover:bg-purple-200 transition-colors"
          >
            <History className="w-12 h-12 mb-3" />
            <p className="font-semibold text-lg">My Requests</p>
          </div>
        )}
        {userType === 'driver' && (
          <div
            onClick={() => setCurrentView('postRide')}
            className="flex flex-col items-center justify-center p-6 bg-green-100 text-green-800 rounded-xl shadow-md cursor-pointer hover:bg-green-200 transition-colors"
          >
            <Plus className="w-12 h-12 mb-3" />
            <p className="font-semibold text-lg">Post a Ride</p>
          </div>
        )}
        {userType === 'driver' && (
          <div
            onClick={() => setCurrentView('myRides')}
            className="flex flex-col items-center justify-center p-6 bg-yellow-100 text-yellow-800 rounded-xl shadow-md cursor-pointer hover:bg-yellow-200 transition-colors"
          >
            <Car className="w-12 h-12 mb-3" />
            <p className="font-semibold text-lg">My Posted Rides</p>
          </div>
        )}
        {userType === 'driver' && (
          <div
            onClick={() => setCurrentView('findRiders')}
            className="flex flex-col items-center justify-center p-6 bg-red-100 text-red-800 rounded-xl shadow-md cursor-pointer hover:bg-red-200 transition-colors"
          >
            <Users className="w-12 h-12 mb-3" />
            <p className="font-semibold text-lg">Find Riders</p>
          </div>
        )}
        <div
          onClick={() => setCurrentView('messages')}
          className="flex flex-col items-center justify-center p-6 bg-indigo-100 text-indigo-800 rounded-xl shadow-md cursor-pointer hover:bg-indigo-200 transition-colors"
        >
          <MessageCircle className="w-12 h-12 mb-3" />
          <p className="font-semibold text-lg">Messages</p>
        </div>
        <div
          onClick={() => setCurrentView('wallet')}
          className="flex flex-col items-center justify-center p-6 bg-teal-100 text-teal-800 rounded-xl shadow-md cursor-pointer hover:bg-teal-200 transition-colors"
        >
          <Wallet className="w-12 h-12 mb-3" />
          <p className="font-semibold text-lg">Wallet</p>
        </div>
         <div
          onClick={() => setCurrentView('profile')}
          className="flex flex-col items-center justify-center p-6 bg-pink-100 text-pink-800 rounded-xl shadow-md cursor-pointer hover:bg-pink-200 transition-colors"
        >
          <UserCog className="w-12 h-12 mb-3" />
          <p className="font-semibold text-lg">Profile</p>
        </div>
      </div>
    </div>
  );

  // --- Main App Render Logic ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-lg font-semibold text-gray-700">Loading application...</div>
      </div>
    );
  }

  // Render authentication/registration views first if not logged in
  if (!currentUser || !currentUser.userType) {
    return (
      <div className="bg-gray-100 min-h-screen flex flex-col items-center justify-center p-4">
        {currentView === 'login' && <Login />}
        {currentView === 'register' && <Registration />}
        {showModal && <MessageModal message={modalMessage} onClose={closeModal} />}
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-gray-100 text-gray-800">
      {/* Navigation Bar */}
      <nav className="bg-white shadow-lg p-4 flex justify-between items-center fixed w-full z-10 top-0">
        <div className="flex items-center space-x-4">
          <button onClick={() => setCurrentView('home')} className="text-blue-600 hover:text-blue-800 p-2 rounded-full hover:bg-gray-100 transition-colors" aria-label="Home">
            <Home className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">RideShare App</h1>
        </div>
        <div className="flex items-center space-x-4">
          {currentUser && (
            <span className="text-gray-700 hidden sm:inline">Welcome, <span className="font-semibold">{currentUser.name || 'User'}</span>!</span>
          )}
          <button
            onClick={() => {
              // Sign out logic
              auth.signOut();
              setCurrentUser(null);
              setUserType('');
              setCurrentView('login');
              showMessage('You have been signed out.');
            }}
            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="container mx-auto p-4 pt-20"> {/* Adjust padding top for fixed nav */}
        {showModal && <MessageModal message={modalMessage} onClose={closeModal} />}

        {/* Dynamic View Rendering */}
        <div className="flex justify-center"> {/* Centering content */}
            <div className="w-full max-w-4xl"> {/* Limiting width for better readability */}
                {(() => {
                    switch (currentView) {
                        case 'home': return <HomeView />;
                        case 'searchRides': return <SearchRides />;
                        case 'postRide': return <PostRide />;
                        case 'myRides': return <MyRides />;
                        case 'messages': return <MessagingView />;
                        case 'wallet': return <WalletView />;
                        case 'myRequests': return <MyRequests />;
                        case 'findRiders': return <FindRiders />;
                        case 'profile': return <ProfileView />;
                        default: return <HomeView />;
                    }
                })()}
            </div>
        </div>
      </main>
    </div>
  );
};

export default CarpoolApp;
